/*
 * Office 家族转换（纯 Rust，自 InspireLoom services/format_convert/office.rs 移植）：
 *   docx 读 -> md；md 写 -> docx
 *   xlsx / xls 读 -> md 表格；md 写 -> xlsx
 * 用途：docx / xlsx 在 MdView 中以 Markdown 形态直接编辑，保存写回原格式。
 */

use std::io::Cursor;

use calamine::Reader;
use docx_rs::*;
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

// ---------------------------------------------------------------------------
// DOCX 读 -> Markdown
// ---------------------------------------------------------------------------

/// DOCX -> Markdown（段落/标题/表格）。
pub fn docx_to_md(input: &[u8]) -> Result<String, String> {
    let doc = read_docx(input).map_err(|e| format!("DOCX 读取失败：{e}"))?;
    let mut out = String::new();
    for child in &doc.document.children {
        match child {
            DocumentChild::Paragraph(p) => {
                let text = paragraph_text(p);
                if text.trim().is_empty() {
                    out.push('\n');
                    continue;
                }
                match heading_level(&p.property) {
                    Some(l) => out.push_str(&format!("{} {}\n\n", "#".repeat(l), text)),
                    None => out.push_str(&format!("{}\n\n", text)),
                }
            }
            DocumentChild::Table(t) => {
                out.push_str(&table_to_md(t));
                out.push('\n');
            }
            _ => {}
        }
    }
    Ok(out.trim().to_string())
}

fn paragraph_text(p: &Paragraph) -> String {
    let mut s = String::new();
    for child in &p.children {
        if let ParagraphChild::Run(run) = child {
            for rc in &run.children {
                if let RunChild::Text(t) = rc {
                    s.push_str(&t.text);
                }
            }
        }
    }
    s
}

fn heading_level(prop: &ParagraphProperty) -> Option<usize> {
    if let Some(style) = &prop.style {
        for l in 1..=6 {
            if style.val.contains(&format!("Heading{l}")) {
                return Some(l);
            }
        }
    }
    None
}

fn table_to_md(t: &Table) -> String {
    let mut out = String::new();
    let mut first = true;
    for row in &t.rows {
        let TableChild::TableRow(r) = row;
        let cells: Vec<String> = r
            .cells
            .iter()
            .filter_map(|c| {
                let TableRowChild::TableCell(cell) = c;
                Some(cell_text(cell))
            })
            .collect();
        let esc = |s: &str| s.replace('|', "\\|").replace('\n', " ");
        out.push('|');
        for c in &cells {
            out.push_str(&format!(" {} |", esc(c)));
        }
        out.push('\n');
        if first {
            out.push('|');
            for _ in &cells {
                out.push_str(" --- |");
            }
            out.push('\n');
            first = false;
        }
    }
    out
}

fn cell_text(cell: &TableCell) -> String {
    let mut s = String::new();
    for content in &cell.children {
        if let TableCellContent::Paragraph(p) = content {
            s.push_str(&paragraph_text(p));
            s.push(' ');
        }
    }
    s.trim().to_string()
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
