/*
 * Office 家族转换（纯 Rust，自 InspireLoom services/format_convert/office.rs 移植）：
 *   docx 读 -> md；md 写 -> docx
 *   xlsx / xls 读 -> md 表格；md 写 -> xlsx
 * 用途：docx / xlsx 在 MdView 中以 Markdown 形态直接编辑，保存写回原格式。
 */

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::Path;

use base64::Engine as _;
use calamine::Reader;
use docx_rs::*;
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use quick_xml::events::Event as XmlEvent;
use quick_xml::writer::Writer as XmlWriter;
use serde::Serialize;

// ---------------------------------------------------------------------------
// DOCX 读 -> Markdown
// ---------------------------------------------------------------------------

/// DOCX -> Markdown（段落/标题/表格）。
pub fn docx_to_md(input: &[u8]) -> Result<String, String> {
    let doc_xml = read_docx_part(input, "word/document.xml")?;
    let blocks = parse_docx_document(&doc_xml);
    let mut out = String::new();
    for b in &blocks {
        match b {
            DxBlock::Para(p) => {
                let text: String = p.runs.iter().map(|r| r.text.clone()).collect();
                if text.trim().is_empty() {
                    continue;
                }
                match dx_heading_level(p) {
                    Some(l) => out.push_str(&format!("{} {}\n\n", "#".repeat(l), text)),
                    None => out.push_str(&format!("{}\n\n", text)),
                }
            }
            DxBlock::Table(t) => {
                out.push_str(&dx_table_md(t));
                out.push('\n');
            }
        }
    }
    Ok(out.trim().to_string())
}

fn dx_heading_level(p: &DxPara) -> Option<usize> {
    let style = p.style.as_deref()?;
    (1..=6).find(|l| style.contains(&format!("Heading{l}")))
}

fn dx_table_md(t: &[Vec<DxCell>]) -> String {
    let esc = |s: &str| s.replace('|', "\\|").replace('\n', " ");
    let cell_text = |c: &DxCell| -> String {
        c.paras
            .iter()
            .map(|p| {
                let t: String = p.runs.iter().map(|r| r.text.clone()).collect();
                t.trim().to_string()
            })
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    };
    let mut out = String::new();
    let mut first = true;
    for row in t {
        out.push('|');
        for c in row {
            out.push_str(&format!(" {} |", esc(&cell_text(c))));
        }
        out.push('\n');
        if first {
            out.push('|');
            for _ in row {
                out.push_str(" --- |");
            }
            out.push('\n');
            first = false;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// DOCX 读（自研 quick_xml 解析，替代 docx_rs read_docx 的 xml-rs 全量解析：
// 后者对含图片的 WPS 文档耗时达秒级，且拿不到 zip 内媒体字节）
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Debug)]
struct DxRun {
    text: String,
    bold: bool,
    italic: bool,
    underline: bool,
    sz: Option<u32>,     // 半磅（w:sz val）
    color: Option<String>,
    pic: Option<String>, // a:blip r:embed
}

#[derive(Default, Clone, Debug)]
struct DxPara {
    runs: Vec<DxRun>,
    style: Option<String>, // w:pStyle val（Heading1..6）
    num: bool,             // w:numPr 列表项
    algn: Option<String>,  // w:jc val
}

#[derive(Default, Clone, Debug)]
struct DxCell {
    paras: Vec<DxPara>,
}

#[derive(Debug, Clone)]
enum DxBlock {
    Para(DxPara),
    Table(Vec<Vec<DxCell>>),
}

/// 解析 word/document.xml，得到正文块序列（段落 / 表格，保持文档顺序）。
fn parse_docx_document(xml: &str) -> Vec<DxBlock> {
    let mut reader = quick_xml::reader::Reader::from_str(xml);
    let mut blocks: Vec<DxBlock> = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut cur_para: Option<DxPara> = None;
    let mut cur_run: Option<DxRun> = None;
    let mut tbl: Option<Vec<Vec<DxCell>>> = None;
    let mut row: Option<Vec<DxCell>> = None;
    let mut cell: Option<DxCell> = None;
    let mut in_cell = false;
    let mut in_rpr = false;
    let mut in_ppr = false;
    let mut in_t = false;

    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Eof) => break,
            Ok(quick_xml::events::Event::Start(e)) => {
                let local = qname_local(e.name());
                match local.as_str() {
                    "p" => cur_para = Some(DxPara::default()),
                    "r" => {
                        if cur_para.is_some() {
                            cur_run = Some(DxRun::default());
                        }
                    }
                    "rPr" => in_rpr = true,
                    "pPr" => in_ppr = true,
                    "t" => in_t = true,
                    "tbl" => {
                        if !in_cell {
                            tbl = Some(Vec::new());
                        }
                    }
                    "tr" => {
                        if tbl.is_some() {
                            row = Some(Vec::new());
                        }
                    }
                    "tc" => {
                        in_cell = true;
                        cell = Some(DxCell::default());
                    }
                    "b" | "i" | "u" | "color" | "sz" => {
                        if in_rpr {
                            if let Some(r) = cur_run.as_mut() {
                                match local.as_str() {
                                    "b" => r.bold = dx_flag(&e),
                                    "i" => r.italic = dx_flag(&e),
                                    "u" => r.underline = dx_flag(&e),
                                    "color" => r.color = px_attr(&e, "val"),
                                    "sz" => r.sz = px_attr(&e, "val").and_then(|v| v.parse().ok()),
                                    _ => {}
                                }
                            }
                        }
                    }
                    "pStyle" => {
                        if in_ppr {
                            if let Some(p) = cur_para.as_mut() {
                                p.style = px_attr(&e, "val");
                            }
                        }
                    }
                    "numPr" => {
                        if in_ppr {
                            if let Some(p) = cur_para.as_mut() {
                                p.num = true;
                            }
                        }
                    }
                    "jc" => {
                        if in_ppr {
                            if let Some(p) = cur_para.as_mut() {
                                p.algn = px_attr(&e, "val");
                            }
                        }
                    }
                    "blip" => {
                        if let Some(r) = cur_run.as_mut() {
                            r.pic = px_attr(&e, "embed");
                        }
                    }
                    _ => {}
                }
                stack.push(local);
            }
            Ok(quick_xml::events::Event::Empty(e)) => {
                let local = qname_local(e.name());
                match local.as_str() {
                    "b" | "i" | "u" | "color" | "sz" => {
                        if in_rpr {
                            if let Some(r) = cur_run.as_mut() {
                                match local.as_str() {
                                    "b" => r.bold = dx_flag(&e),
                                    "i" => r.italic = dx_flag(&e),
                                    "u" => r.underline = dx_flag(&e),
                                    "color" => r.color = px_attr(&e, "val"),
                                    "sz" => r.sz = px_attr(&e, "val").and_then(|v| v.parse().ok()),
                                    _ => {}
                                }
                            }
                        }
                    }
                    "pStyle" => {
                        if in_ppr {
                            if let Some(p) = cur_para.as_mut() {
                                p.style = px_attr(&e, "val");
                            }
                        }
                    }
                    "numPr" => {
                        if in_ppr {
                            if let Some(p) = cur_para.as_mut() {
                                p.num = true;
                            }
                        }
                    }
                    "jc" => {
                        if in_ppr {
                            if let Some(p) = cur_para.as_mut() {
                                p.algn = px_attr(&e, "val");
                            }
                        }
                    }
                    "blip" => {
                        if let Some(r) = cur_run.as_mut() {
                            r.pic = px_attr(&e, "embed");
                        }
                    }
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::Text(e)) => {
                if in_t {
                    if let Some(r) = cur_run.as_mut() {
                        r.text
                            .push_str(&e.unescape().map(|c| c.into_owned()).unwrap_or_default());
                    }
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let local = qname_local(e.name());
                match local.as_str() {
                    "rPr" => in_rpr = false,
                    "pPr" => in_ppr = false,
                    "t" => in_t = false,
                    "r" => {
                        if let Some(r) = cur_run.take() {
                            if let Some(p) = cur_para.as_mut() {
                                if !r.text.is_empty() || r.pic.is_some() {
                                    p.runs.push(r);
                                }
                            }
                        }
                    }
                    "p" => {
                        if let Some(p) = cur_para.take() {
                            if in_cell {
                                if let Some(c) = cell.as_mut() {
                                    c.paras.push(p);
                                }
                            } else {
                                blocks.push(DxBlock::Para(p));
                            }
                        }
                    }
                    "tc" => {
                        in_cell = false;
                        if let Some(c) = cell.take() {
                            if let Some(rw) = row.as_mut() {
                                rw.push(c);
                            }
                        }
                    }
                    "tr" => {
                        if let Some(rw) = row.take() {
                            if let Some(t) = tbl.as_mut() {
                                t.push(rw);
                            }
                        }
                    }
                    "tbl" => {
                        if let Some(t) = tbl.take() {
                            blocks.push(DxBlock::Table(t));
                        }
                    }
                    _ => {}
                }
                stack.pop();
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    blocks
}

/// w:b / w:i / w:u 开关：w:val="0"/"false" 为关，缺省为开。
fn dx_flag(e: &quick_xml::events::BytesStart) -> bool {
    match px_attr(e, "val").as_deref() {
        None => true,
        Some("0") | Some("false") => false,
        Some(_) => true,
    }
}

/// 读取 docx zip 内的单个部件。
fn read_docx_part(input: &[u8], name: &str) -> Result<String, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(input))
        .map_err(|e| format!("DOCX 读取失败：{e}"))?;
    read_zip_string(&mut zip, name).map_err(|e| format!("DOCX 部件缺失：{e}"))
}

/// 收集 document.xml 中 blip r:embed 的出现顺序（去重）。
fn collect_embed_ids(xml: &str) -> Vec<String> {
    let mut reader = quick_xml::reader::Reader::from_str(xml);
    let mut out: Vec<String> = Vec::new();
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Eof) | Err(_) => break,
            Ok(quick_xml::events::Event::Start(e)) | Ok(quick_xml::events::Event::Empty(e)) => {
                if qname_local(e.name()) == "blip" {
                    if let Some(rid) = px_attr(&e, "embed") {
                        if !out.contains(&rid) {
                            out.push(rid);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    out
}

// ---------------------------------------------------------------------------
// DOCX 读 -> HTML（后端渲染预览，替代前端 mammoth）
// mammoth 对 WPS 产物会抛 "Could not find file in options"（引用 zip 中缺失/外链部件），
// 且整文件 base64 过 IPC 再在主线程解析会卡顿；改为 Rust 原生解析 + 图片 data URI。
// ---------------------------------------------------------------------------

/// DOCX -> HTML：标题 / 粗斜体下划线 / 颜色字号 / 列表 / 表格 / 图片。
pub fn docx_to_html(input: &[u8]) -> Result<String, String> {
    let doc_xml = read_docx_part(input, "word/document.xml")?;
    let blocks = parse_docx_document(&doc_xml);
    // 图片：rels 映射 + zip 媒体字节 -> data URI（按 rid 缓存）
    let mut uris: HashMap<String, String> = HashMap::new();
    {
        let mut zip = zip::ZipArchive::new(Cursor::new(input))
            .map_err(|e| format!("DOCX 读取失败：{e}"))?;
        let rels = read_rels(&mut zip, "word/_rels/document.xml.rels").unwrap_or_default();
        for rid in collect_embed_ids(&doc_xml) {
            if let Some(target) = rels.get(&rid) {
                let media = resolve_target("word", target);
                if let Ok(mut f) = zip.by_name(&media) {
                    let mut bytes = Vec::new();
                    if f.read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
                        uris.insert(
                            rid.clone(),
                            format!(
                                "data:{};base64,{}",
                                sniff_image_mime(&bytes),
                                base64::engine::general_purpose::STANDARD.encode(&bytes)
                            ),
                        );
                    }
                }
            }
        }
    }
    let mut out = String::new();
    let mut in_list = false;
    for b in &blocks {
        match b {
            DxBlock::Para(p) => {
                let inner = dx_para_html(p, &uris);
                if inner.is_empty() {
                    continue;
                }
                if p.num {
                    if !in_list {
                        out.push_str("<ul>");
                        in_list = true;
                    }
                    out.push_str(&format!("<li>{}</li>", inner));
                } else {
                    if in_list {
                        out.push_str("</ul>");
                        in_list = false;
                    }
                    match dx_heading_level(p) {
                        Some(l) => out.push_str(&format!("<h{1}>{0}</h{1}>", inner, l)),
                        None => out.push_str(&format!("<p>{}</p>", inner)),
                    }
                }
            }
            DxBlock::Table(t) => {
                if in_list {
                    out.push_str("</ul>");
                    in_list = false;
                }
                out.push_str(&dx_table_html(t, &uris));
            }
        }
    }
    if in_list {
        out.push_str("</ul>");
    }
    Ok(out)
}

/// docx run -> 行内 HTML（样式 / 图片）。
fn dx_run_html(r: &DxRun, uris: &HashMap<String, String>) -> String {
    if let Some(rid) = &r.pic {
        if let Some(uri) = uris.get(rid) {
            return format!("<img src=\"{}\" style=\"max-width:100%;\"/>", uri);
        }
        return String::new();
    }
    if r.text.is_empty() {
        return String::new();
    }
    let mut st = String::new();
    if let Some(sz) = r.sz {
        // 半磅 -> px：pt = sz/2，px = pt * 4/3
        st.push_str(&format!("font-size:{:.0}px;", sz as f64 / 2.0 * 4.0 / 3.0));
    }
    if let Some(c) = &r.color {
        st.push_str(&format!("color:#{};", c));
    }
    if r.underline {
        st.push_str("text-decoration:underline;");
    }
    let esc = escape_html(&r.text);
    let inner = if st.is_empty() {
        esc
    } else {
        format!("<span style=\"{}\">{}</span>", st, esc)
    };
    match (r.bold, r.italic) {
        (true, true) => format!("<strong><em>{}</em></strong>", inner),
        (true, false) => format!("<strong>{}</strong>", inner),
        (false, true) => format!("<em>{}</em>", inner),
        _ => inner,
    }
}

/// docx 段落 -> 行内 HTML。
fn dx_para_html(p: &DxPara, uris: &HashMap<String, String>) -> String {
    let mut out = String::new();
    for r in &p.runs {
        out.push_str(&dx_run_html(r, uris));
    }
    out
}

/// docx 表格 -> HTML。
fn dx_table_html(t: &[Vec<DxCell>], uris: &HashMap<String, String>) -> String {
    let mut out = String::from("<table class=\"docx-table\">");
    for row in t {
        out.push_str("<tr>");
        for c in row {
            let mut cell_html = String::new();
            for p in &c.paras {
                let inner = dx_para_html(p, uris);
                if inner.is_empty() {
                    continue;
                }
                match dx_heading_level(p) {
                    Some(l) => cell_html.push_str(&format!("<h{1}>{0}</h{1}>", inner, l)),
                    None => cell_html.push_str(&format!("<p>{}</p>", inner)),
                }
            }
            out.push_str(&format!("<td>{}</td>", cell_html));
        }
        out.push_str("</tr>");
    }
    out.push_str("</table>");
    out
}

/// 按魔数嗅探图片 MIME（docx_rs 的 Pic 不带扩展名）。
fn sniff_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.len() > 2 && &bytes[0..2] == b"BM" {
        "image/bmp"
    } else {
        "image/png"
    }
}


// ---------------------------------------------------------------------------
// DOCX 写（md -> docx）
// ---------------------------------------------------------------------------

#[derive(Debug)]
enum MdBlock {
    Heading(usize, String),
    Paragraph(String),
    Code(String),
    Table(Vec<Vec<String>>),
}

/// Markdown -> DOCX 字节。
pub fn md_to_docx(md: &str) -> Result<Vec<u8>, String> {
    let blocks = parse_md_blocks(md);
    let mut doc = Docx::new();
    for b in blocks {
        doc = match b {
            MdBlock::Heading(lv, t) => {
                let mut p = Paragraph::new();
                p.property.style = Some(ParagraphStyle::new(Some(format!("Heading{lv}"))));
                let p = p.add_run(Run::new().add_text(t));
                doc.add_paragraph(p)
            }
            MdBlock::Paragraph(t) => {
                doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(t)))
            }
            MdBlock::Code(t) => {
                doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(t)))
            }
            MdBlock::Table(rows) => doc.add_table(build_table(rows)),
        };
    }
    let mut buf: Vec<u8> = Vec::new();
    doc.build()
        .pack(Cursor::new(&mut buf))
        .map_err(|e| format!("DOCX 生成失败：{e}"))?;
    Ok(buf)
}

fn parse_md_blocks(md: &str) -> Vec<MdBlock> {
    let mut blocks = Vec::new();
    let mut para_buf = String::new();
    let mut in_para = false;
    let mut cur_heading_level: Option<usize> = None;
    let mut code_buf = String::new();
    let mut in_code = false;
    let mut table: Option<Vec<Vec<String>>> = None;
    let mut row: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut in_cell = false;
    let mut in_table = false;

    let parser = Parser::new_ext(md, Options::all());
    for ev in parser {
        match ev {
            Event::Start(Tag::Heading { level: l, .. }) => {
                cur_heading_level = Some(level_of(l));
                para_buf.clear();
            }
            Event::End(TagEnd::Heading(_)) => {
                let lv = cur_heading_level.take().unwrap_or(1);
                let t = para_buf.trim().to_string();
                para_buf.clear();
                if !t.is_empty() {
                    blocks.push(MdBlock::Heading(lv, t));
                }
            }
            Event::Start(Tag::Paragraph) => {
                in_para = true;
                para_buf.clear();
            }
            Event::End(TagEnd::Paragraph) => {
                in_para = false;
                let t = para_buf.trim().to_string();
                para_buf.clear();
                if !t.is_empty() {
                    blocks.push(MdBlock::Paragraph(t));
                }
            }
            Event::Start(Tag::Item) => {
                in_para = true;
                para_buf.clear();
            }
            Event::End(TagEnd::Item) => {
                in_para = false;
                let t = para_buf.trim().to_string();
                para_buf.clear();
                if !t.is_empty() {
                    blocks.push(MdBlock::Paragraph(t));
                }
            }
            Event::Start(Tag::CodeBlock(_)) => {
                in_code = true;
                code_buf.clear();
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = false;
                let t = code_buf.trim().to_string();
                code_buf.clear();
                if !t.is_empty() {
                    blocks.push(MdBlock::Code(t));
                }
            }
            Event::Start(Tag::Table(_)) => {
                in_table = true;
                table = Some(Vec::new());
            }
            Event::Start(Tag::TableHead) => {
                if in_table {
                    row = Vec::new();
                }
            }
            Event::End(TagEnd::TableHead) => {
                if in_table {
                    if let Some(t) = table.as_mut() {
                        t.push(std::mem::take(&mut row));
                    }
                }
            }
            Event::End(TagEnd::Table) => {
                if let Some(t) = table.take() {
                    blocks.push(MdBlock::Table(t));
                }
                in_table = false;
            }
            Event::Start(Tag::TableRow) => {
                if in_table {
                    row = Vec::new();
                }
            }
            Event::End(TagEnd::TableRow) => {
                if in_table {
                    if let Some(t) = table.as_mut() {
                        t.push(std::mem::take(&mut row));
                    }
                }
            }
            Event::Start(Tag::TableCell) => {
                if in_table {
                    in_cell = true;
                    cell.clear();
                }
            }
            Event::End(TagEnd::TableCell) => {
                if in_table {
                    let c = cell.trim().to_string();
                    cell.clear();
                    in_cell = false;
                    row.push(c);
                }
            }
            Event::Text(t) => {
                if in_code {
                    code_buf.push_str(&t);
                } else if in_table && in_cell {
                    cell.push_str(&t);
                } else if cur_heading_level.is_some() || in_para {
                    para_buf.push_str(&t);
                }
            }
            Event::Code(t) => {
                if in_code {
                    code_buf.push_str(&t);
                } else {
                    para_buf.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if in_code {
                    code_buf.push('\n');
                } else if in_table && in_cell {
                    cell.push(' ');
                } else {
                    para_buf.push('\n');
                }
            }
            // 行内强调：还原 ** / * 标记，写回时由 runs_to_a_p 转为 run 级粗斜体
            Event::Start(Tag::Strong) | Event::End(TagEnd::Strong) => {
                if in_table && in_cell {
                    cell.push_str("**");
                } else {
                    para_buf.push_str("**");
                }
            }
            Event::Start(Tag::Emphasis) | Event::End(TagEnd::Emphasis) => {
                if in_table && in_cell {
                    cell.push('*');
                } else {
                    para_buf.push('*');
                }
            }
            _ => {}
        }
    }
    blocks
}

fn level_of(l: HeadingLevel) -> usize {
    match l {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn build_table(rows: Vec<Vec<String>>) -> Table {
    let table_rows: Vec<TableRow> = rows
        .into_iter()
        .map(|r| {
            let cells: Vec<TableCell> = r
                .into_iter()
                .map(|c| {
                    TableCell::new().add_paragraph(Paragraph::new().add_run(Run::new().add_text(c)))
                })
                .collect();
            TableRow::new(cells)
        })
        .collect();
    Table::new(table_rows)
}

// ---------------------------------------------------------------------------
// XLSX / XLS 读 -> Markdown 表格（首个工作表）
// ---------------------------------------------------------------------------

pub fn xlsx_to_md(input: &[u8]) -> Result<String, String> {
    let mut wb = calamine::open_workbook_auto_from_rs(Cursor::new(input))
        .map_err(|e| format!("表格读取失败：{e}"))?;
    let range = match wb.worksheet_range_at(0) {
        Some(Ok(r)) => r,
        Some(Err(e)) => return Err(format!("表格读取失败：{e}")),
        None => return Err("表格文件无工作表".to_string()),
    };
    let esc = |s: &str| s.replace('\\', "\\\\").replace('|', "\\|").replace('\n', " ");
    let mut out = String::new();
    let mut first = true;
    for row in range.rows() {
        out.push('|');
        for cell in row {
            out.push_str(&format!(" {} |", esc(&cell.to_string())));
        }
        out.push('\n');
        if first {
            out.push('|');
            for _ in row {
                out.push_str(" --- |");
            }
            out.push('\n');
            first = false;
        }
    }
    Ok(out.trim().to_string())
}

// ---------------------------------------------------------------------------
// PPTX 读 -> Markdown / 写（md -> pptx）
// 自 InspireLoom services/format_convert/office.rs 移植
// ---------------------------------------------------------------------------

use std::io::Write;

/// 幻灯片解析的中间结构（形状级，保留样式与图片）。
#[derive(Default, Clone)]
struct PxRun {
    text: String,
    bold: bool,
    italic: bool,
    sz: Option<u32>,        // 字号（百分点，sz=4400 即 44pt）
    color: Option<String>,  // 文字颜色（srgbClr hex）
}

#[derive(Default, Clone)]
struct PxPara {
    runs: Vec<PxRun>,
    bullet: bool,
    algn: Option<String>, // 段落对齐 l/ctr/r
}

#[derive(Default, Clone)]
struct PxShape {
    is_pic: bool,
    pic_rid: String,
    title: bool,
    paras: Vec<PxPara>,
    x: Option<i64>, // a:off x（EMU）
    y: Option<i64>, // a:off y（EMU）
    w: Option<i64>, // a:ext cx（EMU）
    h: Option<i64>, // a:ext cy（EMU）
    fill: Option<String>, // spPr solidFill 填充色
    anchor_ctr: bool,     // bodyPr anchor="ctr" 垂直居中
}

#[derive(Default)]
struct PxSlide {
    shapes: Vec<PxShape>,
    bg: Option<String>, // 幻灯片背景色
}

/// PPTX -> Markdown（按幻灯片顺序，保留粗体/斜体/列表/标题占位符，图片以占位符标记）。
pub fn pptx_to_md(input: &[u8]) -> Result<String, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(input))
        .map_err(|e| format!("PPTX 读取失败：{e}"))?;
    let names = pptx_slide_names(&mut zip)?;
    let mut out = String::new();
    for (idx, name) in &names {
        let xml = read_zip_string(&mut zip, name)?;
        let slide = parse_pptx_slide(&xml);
        out.push_str(&slide_to_md(&slide, *idx));
        out.push('\n');
    }
    Ok(out.trim().to_string())
}

/// 解析单个幻灯片 XML，得到顶层形状（文本 / 图片）序列，含位置/填充/字号/颜色等样式。
fn parse_pptx_slide(xml: &str) -> PxSlide {
    let mut reader = quick_xml::reader::Reader::from_str(xml);
    let mut slide = PxSlide::default();
    let mut stack: Vec<String> = Vec::new();
    let mut sptree_depth: Option<usize> = None;
    let mut cur: Option<PxShape> = None;
    let mut cur_para: Option<PxPara> = None;
    let mut cur_run: Option<PxRun> = None;
    let mut pic_start: Option<usize> = None;
    // 上下文标记：判定 srgbClr 归属（run 颜色 / 形状填充 / 幻灯片背景）
    let mut in_sp_pr = false;
    let mut in_r_pr = false;
    let mut in_ln = false;
    let mut in_bg = false;

    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Eof) => break,
            Ok(quick_xml::events::Event::Start(e)) => {
                let local = qname_local(e.name());
                let depth = stack.len();
                if sptree_depth.is_none() && local == "spTree" {
                    sptree_depth = Some(depth);
                }
                if let Some(d) = sptree_depth {
                    if depth == d + 1 && (local == "sp" || local == "pic") {
                        cur = Some(PxShape {
                            is_pic: local == "pic",
                            ..Default::default()
                        });
                        if local == "pic" {
                            pic_start = Some(reader.buffer_position() as usize);
                        }
                    }
                }
                match local.as_str() {
                    "p" => cur_para = Some(PxPara::default()),
                    "r" => cur_run = Some(PxRun::default()),
                    "rPr" => {
                        if let Some(r) = cur_run.as_mut() {
                            px_run_attrs(&e, r);
                        }
                        in_r_pr = true;
                    }
                    "spPr" => in_sp_pr = true,
                    "ln" => in_ln = true,
                    "bg" => in_bg = true,
                    "srgbClr" => {
                        if let Some(v) = px_attr(&e, "val") {
                            if in_r_pr {
                                if let Some(r) = cur_run.as_mut() {
                                    r.color = Some(v);
                                }
                            } else if in_bg {
                                slide.bg = Some(v);
                            } else if in_sp_pr && !in_ln {
                                if let Some(sh) = cur.as_mut() {
                                    if sh.fill.is_none() {
                                        sh.fill = Some(v);
                                    }
                                }
                            }
                        }
                    }
                    "off" => {
                        if in_sp_pr {
                            if let Some(sh) = cur.as_mut() {
                                px_geom(&e, sh, "off");
                            }
                        }
                    }
                    "ext" => {
                        if in_sp_pr {
                            if let Some(sh) = cur.as_mut() {
                                px_geom(&e, sh, "ext");
                            }
                        }
                    }
                    "bodyPr" => {
                        if px_attr(&e, "anchor").as_deref() == Some("ctr") {
                            if let Some(sh) = cur.as_mut() {
                                sh.anchor_ctr = true;
                            }
                        }
                    }
                    "pPr" => {
                        if let Some(p) = cur_para.as_mut() {
                            p.algn = px_attr(&e, "algn");
                        }
                    }
                    "ph" => {
                        if let Some(sh) = cur.as_mut() {
                            for a in e.attributes().filter_map(|a| a.ok()) {
                                if qname_local(a.key) == "type" {
                                    let v = String::from_utf8_lossy(&a.value).to_string();
                                    if matches!(v.as_str(), "title" | "centeredTitle" | "subTitle") {
                                        sh.title = true;
                                    }
                                }
                            }
                        }
                    }
                    "buChar" | "buAutoNum" => {
                        if let Some(p) = cur_para.as_mut() {
                            p.bullet = true;
                        }
                    }
                    "buNone" => {
                        if let Some(p) = cur_para.as_mut() {
                            p.bullet = false;
                        }
                    }
                    _ => {}
                }
                stack.push(local);
            }
            Ok(quick_xml::events::Event::Empty(e)) => {
                let local = qname_local(e.name());
                match local.as_str() {
                    "rPr" => {
                        if let Some(r) = cur_run.as_mut() {
                            px_run_attrs(&e, r);
                        }
                    }
                    "srgbClr" => {
                        if let Some(v) = px_attr(&e, "val") {
                            if in_r_pr {
                                if let Some(r) = cur_run.as_mut() {
                                    r.color = Some(v);
                                }
                            } else if in_bg {
                                slide.bg = Some(v);
                            } else if in_sp_pr && !in_ln {
                                if let Some(sh) = cur.as_mut() {
                                    if sh.fill.is_none() {
                                        sh.fill = Some(v);
                                    }
                                }
                            }
                        }
                    }
                    "off" => {
                        if in_sp_pr {
                            if let Some(sh) = cur.as_mut() {
                                px_geom(&e, sh, "off");
                            }
                        }
                    }
                    "ext" => {
                        if in_sp_pr {
                            if let Some(sh) = cur.as_mut() {
                                px_geom(&e, sh, "ext");
                            }
                        }
                    }
                    "bodyPr" => {
                        if px_attr(&e, "anchor").as_deref() == Some("ctr") {
                            if let Some(sh) = cur.as_mut() {
                                sh.anchor_ctr = true;
                            }
                        }
                    }
                    "pPr" => {
                        if let Some(p) = cur_para.as_mut() {
                            p.algn = px_attr(&e, "algn");
                        }
                    }
                    "buChar" | "buAutoNum" => {
                        if let Some(p) = cur_para.as_mut() {
                            p.bullet = true;
                        }
                    }
                    "buNone" => {
                        if let Some(p) = cur_para.as_mut() {
                            p.bullet = false;
                        }
                    }
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::Text(e)) => {
                if let Some(r) = cur_run.as_mut() {
                    r.text
                        .push_str(&e.unescape().map(|c| c.into_owned()).unwrap_or_default());
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let local = qname_local(e.name());
                match local.as_str() {
                    "spPr" => in_sp_pr = false,
                    "ln" => in_ln = false,
                    "rPr" => in_r_pr = false,
                    "bg" => in_bg = false,
                    _ => {}
                }
                if let Some(sh) = cur.as_mut() {
                    match local.as_str() {
                        "p" => {
                            if let Some(p) = cur_para.take() {
                                if p.runs.iter().any(|r| !r.text.trim().is_empty()) {
                                    sh.paras.push(p);
                                }
                            }
                        }
                        "r" => {
                            if let Some(r) = cur_run.take() {
                                if let Some(p) = cur_para.as_mut() {
                                    p.runs.push(r);
                                }
                            }
                        }
                        _ => {}
                    }
                }
                if let Some(d) = sptree_depth {
                    if stack.len() == d + 2 && (local == "sp" || local == "pic") {
                        if local == "pic" {
                            if let (Some(start), Some(sh)) = (pic_start.take(), cur.as_mut()) {
                                let end = reader.buffer_position() as usize;
                                if let Some(rid) = extract_embed(&xml[start..end.min(xml.len())]) {
                                    sh.pic_rid = rid;
                                }
                            }
                        }
                        if let Some(sh) = cur.take() {
                            slide.shapes.push(sh);
                        }
                    }
                }
                stack.pop();
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    slide
}

/// 读取元素属性值（本地名匹配，忽略命名空间前缀）。
fn px_attr(e: &quick_xml::events::BytesStart, name: &str) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| qname_local(a.key) == name)
        .map(|a| String::from_utf8_lossy(&a.value).to_string())
}

/// run 属性：粗体 / 斜体 / 字号（sz 百分点）。
fn px_run_attrs(e: &quick_xml::events::BytesStart, run: &mut PxRun) {
    for a in e.attributes().filter_map(|a| a.ok()) {
        match qname_local(a.key).as_str() {
            "b" => run.bold = a.value.as_ref() == b"1",
            "i" => run.italic = a.value.as_ref() == b"1",
            "sz" => run.sz = String::from_utf8_lossy(&a.value).parse::<u32>().ok(),
            _ => {}
        }
    }
}

/// 形状几何：a:off(x,y) / a:ext(cx,cy)，单位 EMU。
fn px_geom(e: &quick_xml::events::BytesStart, sh: &mut PxShape, tag: &str) {
    let get = |n: &str| -> Option<i64> {
        e.attributes()
            .filter_map(|a| a.ok())
            .find(|a| qname_local(a.key) == n)
            .and_then(|a| String::from_utf8_lossy(&a.value).parse::<i64>().ok())
    };
    match tag {
        "off" => {
            sh.x = get("x");
            sh.y = get("y");
        }
        "ext" => {
            sh.w = get("cx");
            sh.h = get("cy");
        }
        _ => {}
    }
}

fn first_text(p: &PxPara) -> Option<String> {
    let t: String = p.runs.iter().map(|r| r.text.clone()).collect();
    if t.trim().is_empty() {
        None
    } else {
        Some(t.trim().to_string())
    }
}

/// 单张幻灯片 -> Markdown（# 幻灯片 N 标题 + 形状顺序；图片以占位符标记）。
fn slide_to_md(slide: &PxSlide, idx: usize) -> String {
    let mut out = format!("# 幻灯片 {idx}\n\n");
    for sh in &slide.shapes {
        if sh.is_pic {
            out.push_str("![图片](pptx-img)\n");
            continue;
        }
        let mut first = true;
        for p in &sh.paras {
            let t = runs_to_md(&p.runs);
            if t.trim().is_empty() {
                continue;
            }
            if sh.title && first {
                // 标题占位符文本作为首行（保存时自动成为幻灯片标题，避免泄漏 **）
                out.push_str(&format!("{t}\n\n"));
                first = false;
            } else if p.bullet {
                out.push_str(&format!("- {t}\n"));
            } else {
                out.push_str(&format!("{t}\n\n"));
            }
        }
    }
    out
}

/// 行内 run 序列 -> Markdown（粗体 ** / 斜体 *）。
fn runs_to_md(runs: &[PxRun]) -> String {
    let mut s = String::new();
    for r in runs {
        if r.bold && r.italic {
            s.push_str(&format!("***{}***", r.text));
        } else if r.bold {
            s.push_str(&format!("**{}**", r.text));
        } else if r.italic {
            s.push_str(&format!("*{}*", r.text));
        } else {
            s.push_str(&r.text);
        }
    }
    s.trim().to_string()
}

/// 幻灯片纯文本（兜底 / 缩略图用）。
fn slide_plain_text(slide: &PxSlide) -> String {
    let mut lines = Vec::new();
    for sh in &slide.shapes {
        if sh.is_pic {
            continue;
        }
        for p in &sh.paras {
            if let Some(t) = first_text(p) {
                lines.push(t);
            }
        }
    }
    lines.join("\n")
}

/// 幻灯片标题文本（标题占位符优先，否则首段）。
fn slide_title_text(slide: &PxSlide) -> String {
    slide
        .shapes
        .iter()
        .find(|sh| sh.title)
        .and_then(|sh| sh.paras.iter().find_map(first_text))
        .or_else(|| slide.shapes.iter().find_map(|sh| sh.paras.iter().find_map(first_text)))
        .unwrap_or_default()
}

/// 单张幻灯片 -> 富 HTML：960x540 画布内按 xfrm 绝对定位（近似 Office 原版式）。
fn slide_to_html(
    slide: &PxSlide,
    zip: &mut zip::ZipArchive<Cursor<&[u8]>>,
    rels: &HashMap<String, String>,
    sld_cx: i64,
    sld_cy: i64,
) -> String {
    let sx = if sld_cx > 0 { 960.0 / sld_cx as f64 } else { 960.0 / 12192000.0 };
    let sy = if sld_cy > 0 { 540.0 / sld_cy as f64 } else { 540.0 / 6858000.0 };
    let mut resolve = |rid: &str| -> Option<String> {
        let target = rels.get(rid)?;
        let base = Path::new(target).file_name()?;
        let full = format!("ppt/media/{}", base.to_string_lossy());
        let mut f = zip.by_name(&full).ok()?;
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).ok()?;
        Some(format!(
            "data:{};base64,{}",
            mime_for_ext(&full),
            base64::engine::general_purpose::STANDARD.encode(&buf)
        ))
    };
    let bg_style = slide
        .bg
        .as_ref()
        .map(|c| format!("background:#{};", c))
        .unwrap_or_default();
    let mut out = format!("<div class=\"px-canvas\" style=\"{}\">", bg_style);
    for (shape_idx, sh) in slide.shapes.iter().enumerate() {
        if sh.is_pic {
            if let Some(uri) = resolve(&sh.pic_rid) {
                let style = match (sh.x, sh.y, sh.w, sh.h) {
                    (Some(x), Some(y), Some(w), Some(h)) => format!(
                        "position:absolute;left:{:.1}px;top:{:.1}px;width:{:.1}px;height:{:.1}px;object-fit:contain;",
                        x as f64 * sx,
                        y as f64 * sy,
                        w as f64 * sx,
                        h as f64 * sy
                    ),
                    _ => String::new(),
                };
                out.push_str(&format!(
                    "<img class=\"px-img\" data-rid=\"{}\" style=\"{}\" src=\"{}\"/>",
                    sh.pic_rid, style, uri
                ));
            }
            continue;
        }
        let mut body = String::new();
        let mut in_list = false;
        for p in &sh.paras {
            if p.runs.iter().all(|r| r.text.trim().is_empty()) {
                continue;
            }
            let inner: String = p.runs.iter().map(px_run_html).collect();
            let align = px_algn(p.algn.as_deref());
            if p.bullet {
                if !in_list {
                    body.push_str("<ul>");
                    in_list = true;
                }
                body.push_str(&format!("<li style=\"{}\">{}</li>", align, inner));
            } else {
                if in_list {
                    body.push_str("</ul>");
                    in_list = false;
                }
                body.push_str(&format!("<p style=\"{}\">{}</p>", align, inner));
            }
        }
        if in_list {
            body.push_str("</ul>");
        }
        if body.is_empty() && sh.fill.is_none() {
            continue;
        }
        match (sh.x, sh.y, sh.w, sh.h) {
            (Some(x), Some(y), Some(w), Some(h)) => {
                let mut style = format!(
                    "left:{:.1}px;top:{:.1}px;width:{:.1}px;height:{:.1}px;",
                    x as f64 * sx,
                    y as f64 * sy,
                    w as f64 * sx,
                    h as f64 * sy
                );
                if let Some(f) = &sh.fill {
                    style.push_str(&format!("background:#{};", f));
                }
                if sh.anchor_ctr {
                    style.push_str("display:flex;flex-direction:column;justify-content:center;");
                }
                out.push_str(&format!(
                    "<div class=\"px-shape\" data-shp-idx=\"{}\" contenteditable=\"true\" spellcheck=\"false\" tabindex=\"0\" style=\"{}\">{}</div>",
                    shape_idx, style, body
                ));
            }
            _ => {
                let mut style = String::new();
                if let Some(f) = &sh.fill {
                    style.push_str(&format!("background:#{};", f));
                }
                out.push_str(&format!(
                    "<div class=\"px-shape px-flow\" data-shp-idx=\"{}\" contenteditable=\"true\" spellcheck=\"false\" tabindex=\"0\" style=\"{}\">{}</div>",
                    shape_idx, style, body
                ));
            }
        }
    }
    out.push_str("</div>");
    out
}

/// run -> 行内 HTML（字号 / 颜色 / 粗斜体）。
fn px_run_html(r: &PxRun) -> String {
    let t = escape_html(&r.text);
    let mut st = String::new();
    if let Some(sz) = r.sz {
        // sz 百分之一磅 -> px：pt = sz/100，px = pt * 96/72
        st.push_str(&format!("font-size:{:.0}px;", sz as f64 / 100.0 * 4.0 / 3.0));
    }
    if let Some(c) = &r.color {
        st.push_str(&format!("color:#{};", c));
    }
    let inner = if st.is_empty() {
        t
    } else {
        format!("<span style=\"{}\">{}</span>", st, t)
    };
    match (r.bold, r.italic) {
        (true, true) => format!("<strong><em>{}</em></strong>", inner),
        (true, false) => format!("<strong>{}</strong>", inner),
        (false, true) => format!("<em>{}</em>", inner),
        _ => inner,
    }
}

/// 段落对齐 -> CSS。
fn px_algn(algn: Option<&str>) -> &'static str {
    match algn {
        Some("ctr") => "text-align:center;",
        Some("r") => "text-align:right;",
        _ => "",
    }
}

/// 从 presentation.xml 读取幻灯片尺寸（EMU），缺省 16:9。
fn parse_sld_sz(xml: &str) -> (i64, i64) {
    let mut reader = quick_xml::reader::Reader::from_str(xml);
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Empty(e)) | Ok(quick_xml::events::Event::Start(e)) => {
                if qname_local(e.name()) == "sldSz" {
                    let get = |n: &str| -> Option<i64> {
                        e.attributes()
                            .filter_map(|a| a.ok())
                            .find(|a| qname_local(a.key) == n)
                            .and_then(|a| String::from_utf8_lossy(&a.value).parse::<i64>().ok())
                    };
                    if let (Some(cx), Some(cy)) = (get("cx"), get("cy")) {
                        return (cx, cy);
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    (12192000, 6858000)
}

fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

fn extract_embed(raw: &str) -> Option<String> {
    let i = raw.find("r:embed=\"")?;
    let rest = &raw[i + 9..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn slide_number(name: &str) -> Option<usize> {
    let file = name.rsplit('/').next().unwrap_or(name);
    if file.starts_with("slide") && file.ends_with(".xml") {
        file["slide".len()..file.len() - 4].parse::<usize>().ok()
    } else {
        None
    }
}

/// 列出 pptx 内幻灯片（按编号排序）：(编号, zip 内路径)。
fn pptx_slide_names(zip: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Result<Vec<(usize, String)>, String> {
    let mut v: Vec<(usize, String)> = Vec::new();
    for i in 0..zip.len() {
        let name = match zip.by_index(i) {
            Ok(f) => f.name().to_string(),
            Err(_) => continue,
        };
        if let Some(num) = slide_number(&name) {
            v.push((num, name));
        }
    }
    v.sort_by_key(|(n, _)| *n);
    Ok(v)
}

fn read_zip_string(
    zip: &mut zip::ZipArchive<Cursor<&[u8]>>,
    name: &str,
) -> Result<String, String> {
    let mut f = zip.by_name(name).map_err(|e| format!("PPTX 读取失败：{e}"))?;
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
    Ok(s)
}

/// 解析幻灯片 rels（rId -> Target）。
pub(crate) fn read_rels(
    zip: &mut zip::ZipArchive<Cursor<&[u8]>>,
    name: &str,
) -> Result<HashMap<String, String>, String> {
    let mut map = HashMap::new();
    let xml = match read_zip_string(zip, name) {
        Ok(s) => s,
        Err(_) => return Ok(map),
    };
    let mut reader = quick_xml::reader::Reader::from_str(&xml);
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Eof) => break,
            Ok(quick_xml::events::Event::Empty(e)) | Ok(quick_xml::events::Event::Start(e)) => {
                if qname_local(e.name()) == "Relationship" {
                    let mut id = String::new();
                    let mut target = String::new();
                    for a in e.attributes().filter_map(|a| a.ok()) {
                        match qname_local(a.key).as_str() {
                            "Id" => id = String::from_utf8_lossy(&a.value).to_string(),
                            "Target" => target = String::from_utf8_lossy(&a.value).to_string(),
                            _ => {}
                        }
                    }
                    if !id.is_empty() && !target.is_empty() {
                        map.insert(id, target);
                    }
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    Ok(map)
}

fn mime_for_ext(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "tiff" | "tif" => "image/tiff",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// 前端懒加载：返回全部幻灯片标题（便宜，不含图片字节）。
pub fn pptx_outline(input: &[u8]) -> Result<Vec<String>, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(input))
        .map_err(|e| format!("PPTX 读取失败：{e}"))?;
    let names = pptx_slide_names(&mut zip)?;
    let mut out = Vec::new();
    for (_, name) in &names {
        let xml = read_zip_string(&mut zip, name)?;
        let slide = parse_pptx_slide(&xml);
        out.push(slide_title_text(&slide));
    }
    Ok(out)
}

/// 单张幻灯片预览数据（文本 + 样式 HTML + 图片 data URI）。
#[derive(Serialize)]
pub struct PptxSlideData {
    pub index: usize,
    pub title: String,
    pub text: String,
    pub html: String,
}

/// 前端懒加载：按索引返回单张幻灯片（仅该页图片进入内存，支持 130MB+ 大文件渐进渲染）。
pub fn pptx_slide_data(input: &[u8], index: usize) -> Result<PptxSlideData, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(input))
        .map_err(|e| format!("PPTX 读取失败：{e}"))?;
    let names = pptx_slide_names(&mut zip)?;
    if index >= names.len() {
        return Err(format!("幻灯片索引越界：{index} / {}", names.len()));
    }
    let xml = read_zip_string(&mut zip, &names[index].1)?;
    let slide = parse_pptx_slide(&xml);
    let rels_name = format!("ppt/slides/_rels/slide{}.xml.rels", index + 1);
    let rels = read_rels(&mut zip, &rels_name).unwrap_or_default();
    // 画布尺寸：读 presentation.xml 的 sldSz（EMU），按比例缩放到 960x540
    let pres = read_zip_string(&mut zip, "ppt/presentation.xml").unwrap_or_default();
    let (sld_cx, sld_cy) = parse_sld_sz(&pres);
    Ok(PptxSlideData {
        index,
        title: slide_title_text(&slide),
        text: slide_plain_text(&slide),
        html: slide_to_html(&slide, &mut zip, &rels, sld_cx, sld_cy),
    })
}

/// 就地替换某张幻灯片中指定 shape 的文本（按 parse_pptx_slide 枚举的 shape 索引）。
/// 实现：打开 zip，定位 slideN.xml，将目标 <p:sp> 的 <p:txBody> 整段替换为新的纯文本段落。
pub fn update_pptx_text(
    input: &[u8],
    slide_index: usize,
    shape_index: usize,
    text: &str,
) -> Result<Vec<u8>, String> {
    let mut zip_in = zip::ZipArchive::new(Cursor::new(input))
        .map_err(|e| format!("PPTX 读取失败：{e}"))?;
    let names = pptx_slide_names(&mut zip_in)?;
    if slide_index >= names.len() {
        return Err(format!("幻灯片索引越界：{slide_index} / {}", names.len()));
    }
    let slide_name = names[slide_index].1.clone();
    let xml = read_zip_string(&mut zip_in, &slide_name)?;
    let updated = replace_shape_text(&xml, shape_index, text)?;

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut zip_out = zip::write::ZipWriter::new(Cursor::new(&mut buf));
        let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for i in 0..zip_in.len() {
            let file = zip_in.by_index(i).map_err(|e| e.to_string())?;
            if file.name() == slide_name {
                zip_out
                    .start_file(&slide_name, opts)
                    .map_err(|e| e.to_string())?;
                zip_out.write_all(updated.as_bytes()).map_err(|e| e.to_string())?;
            } else {
                zip_out.raw_copy_file(file).map_err(|e| e.to_string())?;
            }
        }
        zip_out.finish().map_err(|e| e.to_string())?;
    }
    Ok(buf)
}

/// 把 slide xml 中第 shape_index 个 shape（sp/pic）的 <p:txBody> 内容替换为 text。
fn replace_shape_text(xml: &str, shape_index: usize, text: &str) -> Result<String, String> {
    let mut reader = quick_xml::reader::Reader::from_str(xml);
    let mut writer = XmlWriter::new(Vec::new());
    let mut stack: Vec<String> = Vec::new();
    let mut sptree_depth: Option<usize> = None;
    let mut shape_count = 0usize;
    let mut in_target = false;

    loop {
        match reader.read_event() {
            Ok(XmlEvent::Eof) => break,
            Ok(XmlEvent::Start(e)) => {
                let local = qname_local(e.name());
                let depth = stack.len();
                if sptree_depth.is_none() && local == "spTree" {
                    sptree_depth = Some(depth);
                }
                if let Some(d) = sptree_depth {
                    if depth == d + 1 && (local == "sp" || local == "pic") {
                        shape_count += 1;
                        if shape_count - 1 == shape_index {
                            in_target = true;
                        }
                    }
                }
                stack.push(local.clone());
                if in_target && local == "txBody" {
                    writer
                        .write_event(XmlEvent::Start(e.clone()))
                        .map_err(|e| e.to_string())?;
                    let mut depth = 1usize;
                    loop {
                        match reader.read_event() {
                            Ok(XmlEvent::End(e2)) => {
                                if qname_local(e2.name()) == "txBody" {
                                    depth -= 1;
                                    if depth == 0 {
                                        writer
                                            .get_mut()
                                            .write_all(build_shape_text_xml(text).as_bytes())
                                            .map_err(|e| e.to_string())?;
                                        writer
                                            .write_event(XmlEvent::End(e2))
                                            .map_err(|e| e.to_string())?;
                                        break;
                                    }
                                }
                            }
                            Ok(XmlEvent::Start(e2)) => {
                                if qname_local(e2.name()) == "txBody" {
                                    depth += 1;
                                }
                            }
                            Ok(XmlEvent::Eof) => break,
                            _ => {}
                        }
                    }
                    in_target = false;
                } else {
                    writer
                        .write_event(XmlEvent::Start(e))
                        .map_err(|e| e.to_string())?;
                }
            }
            Ok(XmlEvent::End(e)) => {
                stack.pop();
                writer
                    .write_event(XmlEvent::End(e))
                    .map_err(|e| e.to_string())?;
            }
            Ok(XmlEvent::Empty(e)) => writer
                .write_event(XmlEvent::Empty(e))
                .map_err(|e| e.to_string())?,
            Ok(XmlEvent::Text(e)) => writer
                .write_event(XmlEvent::Text(e))
                .map_err(|e| e.to_string())?,
            Ok(XmlEvent::CData(e)) => writer
                .write_event(XmlEvent::CData(e))
                .map_err(|e| e.to_string())?,
            Ok(XmlEvent::Comment(e)) => writer
                .write_event(XmlEvent::Comment(e))
                .map_err(|e| e.to_string())?,
            Ok(XmlEvent::Decl(e)) => writer
                .write_event(XmlEvent::Decl(e))
                .map_err(|e| e.to_string())?,
            Ok(XmlEvent::PI(e)) => writer
                .write_event(XmlEvent::PI(e))
                .map_err(|e| e.to_string())?,
            Ok(XmlEvent::DocType(e)) => writer
                .write_event(XmlEvent::DocType(e))
                .map_err(|e| e.to_string())?,
            Err(e) => return Err(e.to_string()),
        }
    }
    String::from_utf8(writer.into_inner()).map_err(|e| e.to_string())
}

/// 把用户输入的纯文本转为 <p:txBody> 内部段落序列（保留换行）。
fn build_shape_text_xml(text: &str) -> String {
    if text.trim().is_empty() {
        return "<a:p><a:endParaRPr/></a:p>".to_string();
    }
    text.split('\n')
        .map(|line| format!("<a:p><a:r><a:t>{}</a:t></a:r></a:p>", xml_escape_text(line)))
        .collect()
}

fn xml_escape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

fn qname_local(name: quick_xml::name::QName) -> String {
    let full = String::from_utf8_lossy(name.0);
    full.split(':').last().unwrap_or(&full).to_string()
}

/// Markdown -> PPTX 字节（手写最小可用 OOXML）。
/// 语义：每个 `# 幻灯片 N` 开启一张新幻灯片；首段作为标题，其余作为正文；
/// 正文支持 `**粗体**` / `*斜体*` 内联样式；原 pptx 中的图片由 original 原位回填。
pub fn md_to_pptx(md: &str, original: &[u8]) -> Result<Vec<u8>, String> {
    // 去掉图片占位符行（图片由原始 pptx 原位回填，不进 markdown 文本）
    let cleaned: String = md
        .lines()
        .filter(|l| !l.trim().starts_with("![图片](pptx-img)"))
        .collect::<Vec<_>>()
        .join("\n");
    let blocks = parse_md_blocks(&cleaned);
    let slides = md_to_slides(&blocks);
    let pics = if !original.is_empty() {
        extract_pics(original, slides.len()).unwrap_or_else(|_| vec![Vec::new(); slides.len()])
    } else {
        vec![Vec::new(); slides.len()]
    };
    build_pptx(&slides, &pics)
}

/// 单张幻灯片的中间表示。
#[derive(Default, Clone)]
struct Slide {
    title: String,
    body: Vec<String>,
}

/// 写回时保留的原始图片（按幻灯片聚合）。
#[derive(Clone)]
struct PicEmbed {
    raw: String,
    bytes: Vec<u8>,
    ext: String,
    rid: String,
}

/// 把 markdown 块序列组织为幻灯片列表。
/// 只有 `# 幻灯片 N`（H1 且以「幻灯片」开头）作为分页符；首段作为标题，其余作为正文。
fn md_to_slides(blocks: &[MdBlock]) -> Vec<Slide> {
    let mut slides: Vec<Slide> = Vec::new();
    let mut cur = Slide::default();
    let mut has_content = false;
    let mut title_set = false;
    for b in blocks {
        match b {
            MdBlock::Heading(_, t) => {
                if t.trim_start().starts_with("幻灯片") {
                    if has_content {
                        slides.push(std::mem::take(&mut cur));
                    }
                    has_content = true;
                    title_set = false;
                } else {
                    // 页内标题：作为正文
                    cur.body.push(t.clone());
                    has_content = true;
                }
            }
            MdBlock::Paragraph(t) | MdBlock::Code(t) => {
                if !title_set && cur.title.is_empty() {
                    cur.title = t.clone();
                    title_set = true;
                } else {
                    cur.body.push(t.clone());
                }
                has_content = true;
            }
            MdBlock::Table(t) => {
                for row in t {
                    cur.body.push(row.join(" | "));
                }
                has_content = true;
            }
        }
    }
    if has_content {
        slides.push(cur);
    }
    if slides.is_empty() {
        slides.push(Slide {
            title: "幻灯片".to_string(),
            body: Vec::new(),
        });
    }
    slides
}

/// 构造最小可用 PPTX（zip + OOXML 部件），并原位回填原 pptx 中的图片。
fn build_pptx(slides: &[Slide], pics: &[Vec<PicEmbed>]) -> Result<Vec<u8>, String> {
    let (parts, media) = pptx_parts(slides, pics);
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(Cursor::new(&mut buf));
        let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (path, content) in &parts {
            zip.start_file(path, opts)
                .map_err(|e| format!("PPTX 打包失败：{e}"))?;
            zip.write_all(content.as_bytes())
                .map_err(|e| format!("PPTX 打包失败：{e}"))?;
        }
        for (path, bytes) in &media {
            zip.start_file(path, opts)
                .map_err(|e| format!("PPTX 打包失败：{e}"))?;
            zip.write_all(bytes)
                .map_err(|e| format!("PPTX 打包失败：{e}"))?;
        }
        zip.finish().map_err(|e| format!("PPTX 打包失败：{e}"))?;
    }
    Ok(buf)
}

/// 生成 PPTX 的全部 OOXML 部件（路径, 内容）；返回 (xml 部件, 媒体字节部件)。
fn pptx_parts(
    slides: &[Slide],
    pics: &[Vec<PicEmbed>],
) -> (Vec<(String, String)>, Vec<(String, Vec<u8>)>) {
    let n = slides.len();
    let ns = "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"";
    let mut parts: Vec<(String, String)> = Vec::new();
    let mut media: Vec<(String, Vec<u8>)> = Vec::new();
    let mut media_counter: u32 = 1;

    // [Content_Types].xml
    let mut ct = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">");
    ct.push_str("<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>");
    ct.push_str("<Default Extension=\"xml\" ContentType=\"application/xml\"/>");
    // 图片扩展名 Default（由原始 pptx 回填的图片决定，避免 Content_Types 缺省导致打不开）
    let mut exts: std::collections::HashSet<String> = std::collections::HashSet::new();
    for p in pics.iter().flatten() {
        exts.insert(p.ext.clone());
    }
    for ext in &exts {
        ct.push_str(&format!(
            "<Default Extension=\"{}\" ContentType=\"{}\"/>",
            ext,
            mime_for_ext(&format!("x.{}", ext))
        ));
    }
    ct.push_str("<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>");
    for i in 1..=n {
        ct.push_str(&format!("<Override PartName=\"/ppt/slides/slide{i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>"));
    }
    ct.push_str("<Override PartName=\"/ppt/slideLayouts/slideLayout1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/>");
    ct.push_str("<Override PartName=\"/ppt/slideMasters/slideMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml\"/>");
    ct.push_str("<Override PartName=\"/ppt/theme/theme1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.theme+xml\"/>");
    ct.push_str("<Override PartName=\"/ppt/presProps.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presProps+xml\"/>");
    ct.push_str("<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>");
    ct.push_str("<Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>");
    ct.push_str("</Types>");
    parts.push(("[Content_Types].xml".to_string(), ct));

    // _rels/.rels
    parts.push((
        "_rels/.rels".to_string(),
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>\
<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>\
</Relationships>"
            .to_string(),
    ));

    // ppt/presentation.xml
    let mut sld_ids = String::new();
    for k in 1..=n {
        sld_ids.push_str(&format!("<p:sldId id=\"{}\" r:id=\"rId{}\"/>", 255 + k + 1, 1 + k));
    }
    let presentation = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:presentation {ns}>\
<p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst>\
<p:sldIdLst>{sld_ids}</p:sldIdLst>\
<p:sldSz cx=\"9144000\" cy=\"6858000\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/>\
</p:presentation>"
    );
    parts.push(("ppt/presentation.xml".to_string(), presentation));

    // ppt/_rels/presentation.xml.rels
    let mut rels =
        String::from("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
    rels.push_str("<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"slideMasters/slideMaster1.xml\"/>");
    for k in 1..=n {
        rels.push_str(&format!(
            "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide{}.xml\"/>",
            1 + k, k
        ));
    }
    rels.push_str(&format!(
        "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps\" Target=\"presProps.xml\"/>",
        2 + n
    ));
    rels.push_str(&format!(
        "<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"theme/theme1.xml\"/>",
        3 + n
    ));
    rels.push_str("</Relationships>");
    parts.push(("ppt/_rels/presentation.xml.rels".to_string(), rels));

    // ppt/presProps.xml
    parts.push((
        "ppt/presProps.xml".to_string(),
        format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:presentationPr {ns}/>"),
    ));

    // ppt/slideMasters/slideMaster1.xml
    let master = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:sldMaster {ns}>\
<p:cSld><p:spTree>\
<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>\
<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title Placeholder 1\"/><p:cNvSpPr><p:spPr/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Text Placeholder 2\"/><p:cNvSpPr><p:spPr/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>\
</p:spTree></p:cSld>\
<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>\
<p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/></p:sldLayoutIdLst>\
<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>\
</p:sldMaster>"
    );
    parts.push(("ppt/slideMasters/slideMaster1.xml".to_string(), master));

    // ppt/slideMasters/_rels/slideMaster1.xml.rels
    parts.push((
        "ppt/slideMasters/_rels/slideMaster1.xml.rels".to_string(),
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme1.xml\"/>\
</Relationships>"
            .to_string(),
    ));

    // ppt/slideLayouts/slideLayout1.xml（titleAndContent）
    let layout = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:sldLayout {ns} type=\"titleAndContent\" preserve=\"1\">\
<p:cSld name=\"Title and Content\"><p:spTree>\
<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>\
<p:sp><p:nvSpPr><p:cNvPr id=\"1\" name=\"Title Placeholder 1\"/><p:cNvSpPr><p:spPr/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Content Placeholder 2\"/><p:cNvSpPr><p:spPr/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>\
</p:spTree></p:cSld>\
<p:clrMapOvr><a:overrideClrMapping bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/></p:clrMapOvr>\
</p:sldLayout>"
    );
    parts.push(("ppt/slideLayouts/slideLayout1.xml".to_string(), layout));

    // ppt/slideLayouts/_rels/slideLayout1.xml.rels
    parts.push((
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels".to_string(),
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"../slideMasters/slideMaster1.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme1.xml\"/>\
</Relationships>"
            .to_string(),
    ));

    // ppt/theme/theme1.xml
    parts.push(("ppt/theme/theme1.xml".to_string(), THEME1.to_string()));

    // 各幻灯片 + 其 rels + 原位回填的图片媒体
    for (k, slide) in slides.iter().enumerate() {
        let idx = k + 1;
        let body = if slide.body.is_empty() {
            "<a:p/>".to_string()
        } else {
            slide
                .body
                .iter()
                .map(|line| runs_to_a_p(line))
                .collect::<Vec<_>>()
                .join("")
        };
        // 原位回填图片：重建 <p:pic> + 新 rId + 媒体部件 + slide rels
        let mut pic_xml = String::new();
        let mut pic_rels = String::new();
        let slide_pics = pics.get(k).map(|v| v.as_slice()).unwrap_or(&[]);
        for (pi, pic) in slide_pics.iter().enumerate() {
            let new_rid = format!("rId{}", 2 + pi);
            let rewritten = pic
                .raw
                .replace(
                    &format!("r:embed=\"{}\"", pic.rid),
                    &format!("r:embed=\"{}\"", new_rid),
                );
            pic_xml.push_str(&rewritten);
            let media_name = format!("image{}.{}", media_counter, pic.ext);
            media.push((format!("ppt/media/{}", media_name), pic.bytes.clone()));
            pic_rels.push_str(&format!(
                "<Relationship Id=\"{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/{}\"/>",
                new_rid, media_name
            ));
            media_counter += 1;
        }
        let slide_xml = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<p:sld {ns}>\
<p:cSld><p:spTree>\
<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr><p:grpSpPr/>\
<p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title\"/><p:cNvSpPr><p:spPr/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>{}</a:t></a:r></a:p></p:txBody></p:sp>\
<p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Body\"/><p:cNvSpPr><p:spPr/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{body}</p:txBody></p:sp>\
{pic_xml}\
</p:spTree></p:cSld>\
<p:clrMapOvr><a:overrideClrMapping bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/></p:clrMapOvr>\
</p:sld>",
            xml_escape(&slide.title)
        );
        parts.push((format!("ppt/slides/slide{idx}.xml"), slide_xml));
        parts.push((
            format!("ppt/slides/_rels/slide{idx}.xml.rels"),
            format!(
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>\
{pic_rels}\
</Relationships>"
            ),
        ));
    }

    // docProps
    parts.push((
        "docProps/core.xml".to_string(),
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\
<dc:title>Converted Presentation</dc:title><dc:creator>MdView</dc:creator>\
<cp:lastModifiedBy>MdView</cp:lastModifiedBy>\
<dcterms:created xsi:type=\"dcterms:W3CDTF\">2024-01-01T00:00:00Z</dcterms:created>\
<dcterms:modified xsi:type=\"dcterms:W3CDTF\">2024-01-01T00:00:00Z</dcterms:modified>\
</cp:coreProperties>"
            .to_string(),
    ));
    parts.push((
        "docProps/app.xml".to_string(),
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">\
<Application>MdView</Application></Properties>"
            .to_string(),
    ));

    (parts, media)
}

/// 最小可用主题（供 slideMaster / slideLayout 引用）。
const THEME1: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n\
<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"Office Theme\">\
<a:themeElements>\
<a:clrScheme name=\"Office\">\
<a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1>\
<a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>\
<a:dk2><a:srgbClr val=\"1F3864\"/></a:dk2>\
<a:lt2><a:srgbClr val=\"EEF1F7\"/></a:lt2>\
<a:accent1><a:srgbClr val=\"2E74B5\"/></a:accent1>\
<a:accent2><a:srgbClr val=\"4EB3D6\"/></a:accent2>\
<a:accent3><a:srgbClr val=\"A5CA37\"/></a:accent3>\
<a:accent4><a:srgbClr val=\"F0A30A\"/></a:accent4>\
<a:accent5><a:srgbClr val=\"D9534F\"/></a:accent5>\
<a:accent6><a:srgbClr val=\"8064A2\"/></a:accent6>\
<a:hlink><a:srgbClr val=\"2E74B5\"/></a:hlink>\
<a:folHlink><a:srgbClr val=\"9B2C9E\"/></a:folHlink>\
</a:clrScheme>\
<a:fontScheme name=\"Office\">\
<a:majorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont>\
<a:minorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont>\
</a:fontScheme>\
<a:fmtScheme name=\"Office\">\
<a:fillStyleLst>\
<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>\
<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>\
<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>\
</a:fillStyleLst>\
<a:lnStyleLst>\
<a:ln w=\"6350\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:prstDash val=\"solid\"/></a:ln>\
<a:ln w=\"12700\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:prstDash val=\"solid\"/></a:ln>\
<a:ln w=\"19050\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:prstDash val=\"solid\"/></a:ln>\
</a:lnStyleLst>\
<a:effectStyleLst>\
<a:effectStyle><a:effectLst/></a:effectStyle>\
<a:effectStyle><a:effectLst/></a:effectStyle>\
<a:effectStyle><a:effectLst/></a:effectStyle>\
</a:effectStyleLst>\
<a:bgFillStyleLst>\
<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>\
<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>\
<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>\
</a:bgFillStyleLst>\
</a:fmtScheme>\
</a:themeElements>\
<a:objectDefaults/><a:extraClrSchemeLst/>\
</a:theme>";

/// XML 文本转义。
fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// PPTX 写回：图片原位回填 + 内联强调
// ---------------------------------------------------------------------------

/// 单行文本 -> OOXML 段落序列（解析 `**粗体**` / `*斜体*` / `***粗斜***`）。
fn runs_to_a_p(text: &str) -> String {
    let mut out = String::new();
    for (seg, bold, italic) in parse_emphasis(text) {
        let rpr = if bold && italic {
            "<a:rPr b=\"1\" i=\"1\"/>"
        } else if bold {
            "<a:rPr b=\"1\"/>"
        } else if italic {
            "<a:rPr i=\"1\"/>"
        } else {
            "<a:rPr/>"
        };
        out.push_str(&format!(
            "<a:p><a:r>{}{}</a:r></a:p>",
            rpr,
            format!("<a:t>{}</a:t>", xml_escape(&seg))
        ));
    }
    out
}

/// 行内强调解析：`**粗体**`、`*斜体*`、`***粗斜***`。返回 (文本, 粗体, 斜体) 片段序列。
fn parse_emphasis(text: &str) -> Vec<(String, bool, bool)> {
    let bytes = text.as_bytes();
    let mut out: Vec<(String, bool, bool)> = Vec::new();
    let mut start = 0usize;
    let mut seg_bold = false;
    let mut seg_italic = false;
    let mut i = 0;
    while i < bytes.len() {
        if i + 2 < bytes.len() && &bytes[i..i + 3] == b"***" {
            out.push((text[start..i].to_string(), seg_bold, seg_italic));
            start = i + 3;
            if seg_bold && seg_italic {
                seg_bold = false;
                seg_italic = false;
            } else {
                seg_bold = true;
                seg_italic = true;
            }
            i += 3;
        } else if i + 1 < bytes.len() && &bytes[i..i + 2] == b"**" {
            out.push((text[start..i].to_string(), seg_bold, seg_italic));
            start = i + 2;
            seg_bold = !seg_bold;
            i += 2;
        } else if bytes[i] == b'*' {
            out.push((text[start..i].to_string(), seg_bold, seg_italic));
            start = i + 1;
            seg_italic = !seg_italic;
            i += 1;
        } else {
            i += 1;
        }
    }
    if start < text.len() {
        out.push((text[start..].to_string(), seg_bold, seg_italic));
    }
    out.retain(|(s, _, _)| !s.is_empty());
    out
}

/// 从原始 pptx 提取每张幻灯片的图片（按幻灯片顺序聚合），供写回时原位回填。
fn extract_pics(original: &[u8], n: usize) -> Result<Vec<Vec<PicEmbed>>, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(original))
        .map_err(|e| format!("PPTX 读取失败：{e}"))?;
    let mut all: Vec<Vec<PicEmbed>> = Vec::with_capacity(n);
    for i in 1..=n {
        let slide_name = format!("ppt/slides/slide{i}.xml");
        let xml = match read_zip_string(&mut zip, &slide_name) {
            Ok(s) => s,
            Err(_) => {
                all.push(Vec::new());
                continue;
            }
        };
        let rels_name = format!("ppt/slides/_rels/slide{i}.xml.rels");
        let rels = read_rels(&mut zip, &rels_name).unwrap_or_default();
        let pics = parse_pics_in_slide(&xml, &rels, &mut zip)?;
        all.push(pics);
    }
    Ok(all)
}

/// 解析单个幻灯片 XML 中的全部 `<p:pic>`，提取原始 XML + 字节 + 扩展名。
fn parse_pics_in_slide(
    xml: &str,
    rels: &HashMap<String, String>,
    zip: &mut zip::ZipArchive<Cursor<&[u8]>>,
) -> Result<Vec<PicEmbed>, String> {
    let mut reader = quick_xml::reader::Reader::from_str(xml);
    let mut out: Vec<PicEmbed> = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut pic_start: Option<usize> = None;
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Start(e)) => {
                let local = qname_local(e.name());
                if local == "pic" {
                    pic_start = Some(reader.buffer_position() as usize);
                }
                stack.push(local);
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let local = qname_local(e.name());
                if local == "pic" {
                    if let Some(start) = pic_start.take() {
                        let end = reader.buffer_position() as usize;
                        let raw = xml[start..end.min(xml.len())].to_string();
                        if let Some(rid) = extract_embed(&raw) {
                            if let Some(target) = rels.get(&rid) {
                                let media_name = resolve_target("ppt/slides", target);
                                if let Ok(mut f) = zip.by_name(&media_name) {
                                    let mut bytes = Vec::new();
                                    if f.read_to_end(&mut bytes).is_ok() {
                                        let ext = Path::new(&media_name)
                                            .extension()
                                            .and_then(|e| e.to_str())
                                            .unwrap_or("png")
                                            .to_string();
                                        out.push(PicEmbed {
                                            raw,
                                            bytes,
                                            ext,
                                            rid,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                stack.pop();
            }
            Ok(quick_xml::events::Event::Eof) => break,
            _ => {}
        }
    }
    Ok(out)
}

/// 将幻灯片 rels 的相对 Target 解析为 zip 内绝对路径（base = ppt/slides）。
pub(crate) fn resolve_target(base_dir: &str, target: &str) -> String {
    let combined = format!("{}/{}", base_dir.trim_end_matches('/'), target);
    let mut stack: Vec<String> = Vec::new();
    for p in combined.split('/') {
        if p.is_empty() || p == "." {
            continue;
        } else if p == ".." {
            stack.pop();
        } else {
            stack.push(p.to_string());
        }
    }
    stack.join("/")
}

// ---------------------------------------------------------------------------
// XLSX 写（md -> xlsx）
// ---------------------------------------------------------------------------

/// Markdown -> XLSX 字节。
/// 语义：标题/段落/代码块各占 A 列一行；Markdown 表格展开为网格行，按出现顺序交错写入。
pub fn md_to_xlsx(md: &str) -> Result<Vec<u8>, String> {
    let blocks = parse_md_blocks(md);
    let mut rows: Vec<Vec<String>> = Vec::new();
    for b in &blocks {
        match b {
            MdBlock::Heading(_, t) | MdBlock::Paragraph(t) | MdBlock::Code(t) => {
                rows.push(vec![t.clone()]);
            }
            MdBlock::Table(t) => {
                rows.extend(t.iter().cloned());
            }
        }
    }
    let mut wb = rust_xlsxwriter::Workbook::new();
    let ws = wb.add_worksheet();
    for (r, row) in rows.iter().enumerate() {
        for (c, cell) in row.iter().enumerate() {
            ws.write_string(r as u32, c as u16, cell)
                .map_err(|e| e.to_string())?;
        }
    }
    wb.save_to_buffer().map_err(|e| format!("XLSX 生成失败：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pptx_roundtrip_and_canvas() {
        let md = "# 幻灯片 1\n\n标题行\n\n正文**加粗**段落\n";
        let bytes = md_to_pptx(md, &[]).unwrap();
        let outline = pptx_outline(&bytes).unwrap();
        assert_eq!(outline.len(), 1);
        assert_eq!(outline[0], "标题行");
        let slide = pptx_slide_data(&bytes, 0).unwrap();
        assert!(slide.html.contains("px-canvas"));
        assert!(slide.html.contains("<strong>"));
    }

    // 以下测试依赖本机真实文件，默认忽略：cargo test -- --ignored

    #[test]
    #[ignore]
    fn real_pptx_lazy_render() {
        let path = "/Users/tatsuma/Downloads/深涌智能-深研院研究中心建设计划书_20260120改.pptx";
        let data = std::fs::read(path).unwrap();
        let t = std::time::Instant::now();
        let outline = pptx_outline(&data).unwrap();
        println!("outline {} 页，耗时 {:?}", outline.len(), t.elapsed());
        let t = std::time::Instant::now();
        let slide = pptx_slide_data(&data, 6).unwrap();
        println!("单页渲染耗时 {:?}，html {} 字节", t.elapsed(), slide.html.len());
        assert!(slide.html.contains("px-canvas"));
        assert!(slide.html.contains("px-img"));
    }

    #[test]
    #[ignore]
    fn real_docx_backend_html() {
        let path = "/Users/tatsuma/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_o8a5odfjy2ri21_d71e/msg/file/2026-09/管理后台操作手册-补充工作流与代码沙箱-重新排版.docx";
        let data = std::fs::read(path).unwrap();
        let t = std::time::Instant::now();
        let html = docx_to_html(&data).unwrap();
        println!("docx->html 耗时 {:?}，{} 字节", t.elapsed(), html.len());
        assert!(html.contains("<img"));
        assert!(html.contains("<h") || html.contains("<table"));
    }
}
