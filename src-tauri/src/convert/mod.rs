//! 文档格式转换（对齐 InspireLoom `src-tauri/src/services/format_convert`，
//! 按 MdView「文档类优先」矩阵裁剪）。
//!
//! 设计：**以 markdown 为唯一枢纽**——
//!   - 任意源先 `read_as_markdown`（docx/xlsx/pptx 复用 `crate::office` 的既有读回器，
//!     html/csv 走 `text` 模块的轻量映射）；
//!   - 再按目标格式序列化（md/txt/html 由 `text` 生成，docx/xlsx/pptx 复用
//!     `crate::office::md_to_*`）。
//!
//! 支持矩阵（文档类，`can_convert` 单一事实来源）：
//!   md    -> txt / html / docx / xlsx / pptx / pdf
//!   txt   -> md / html / docx
//!   html  -> md / txt
//!   csv   -> md / xlsx
//!   docx  -> md / txt / html / xlsx / pptx
//!   xlsx  -> md / csv / docx / pptx
//!   pptx  -> md / txt / docx / xlsx
//!
//! ⚠️ `pdf` 作为目标：本模块**不生成** PDF（纯 Rust 无渲染引擎，无法处理
//! Mermaid / 本地图片 / 预览样式）。矩阵保留 `pdf` 只为让前端拿到统一的候选列表，
//! 实际导出由前端「所见即所得」路径完成（marked 渲染 HTML → canvas → PDF）。

pub mod commands;
pub mod text;

/// 支持的文档格式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Md,
    Txt,
    Html,
    Csv,
    Docx,
    Xlsx,
    Pptx,
    Pdf,
}

/// 转换产物。
pub struct ConvertOutput {
    pub data: Vec<u8>,
    /// 文本格式（可直接以文本落盘/展示）还是二进制（Office/PDF）。
    pub is_text: bool,
}

/// 扩展名 / 格式名规范化。
pub fn normalize_format(s: &str) -> Option<Format> {
    let key = s.trim().to_lowercase();
    let key = key.strip_prefix('.').unwrap_or(&key);
    match key {
        "md" | "markdown" => Some(Format::Md),
        "txt" | "text" | "plain" => Some(Format::Txt),
        "html" | "htm" => Some(Format::Html),
        "csv" => Some(Format::Csv),
        "docx" | "doc" => Some(Format::Docx),
        "xlsx" | "xls" => Some(Format::Xlsx),
        "pptx" | "ppt" => Some(Format::Pptx),
        "pdf" => Some(Format::Pdf),
        _ => None,
    }
}

/// 文本类格式（落盘为文本、预览走文本渲染）。
pub fn is_text_format(f: Format) -> bool {
    matches!(f, Format::Md | Format::Txt | Format::Html | Format::Csv)
}

/// 格式对应的落盘扩展名。
pub fn format_ext(f: Format) -> &'static str {
    match f {
        Format::Md => "md",
        Format::Txt => "txt",
        Format::Html => "html",
        Format::Csv => "csv",
        Format::Docx => "docx",
        Format::Xlsx => "xlsx",
        Format::Pptx => "pptx",
        Format::Pdf => "pdf",
    }
}

/// 格式的中文显示名（错误信息 / 前端标签用）。
pub fn format_label(f: Format) -> &'static str {
    match f {
        Format::Md => "Markdown",
        Format::Txt => "纯文本",
        Format::Html => "HTML",
        Format::Csv => "CSV",
        Format::Docx => "Word",
        Format::Xlsx => "Excel",
        Format::Pptx => "PPT",
        Format::Pdf => "PDF",
    }
}

/// 单步转换是否受支持（不含自身）。矩阵唯一事实来源。
pub fn can_convert(from: Format, to: Format) -> bool {
    if from == to {
        return false;
    }
    matches!(
        (from, to),
        (
            Format::Md,
            Format::Txt | Format::Html | Format::Docx | Format::Xlsx | Format::Pptx | Format::Pdf
        ) | (Format::Txt, Format::Md | Format::Html | Format::Docx)
            | (Format::Html, Format::Md | Format::Txt)
            | (Format::Csv, Format::Md | Format::Xlsx)
            | (
                Format::Docx,
                Format::Md | Format::Txt | Format::Html | Format::Xlsx | Format::Pptx
            )
            | (Format::Xlsx, Format::Md | Format::Csv | Format::Docx | Format::Pptx)
            | (Format::Pptx, Format::Md | Format::Txt | Format::Docx | Format::Xlsx)
    )
}

/// 某源格式支持的全部目标扩展名（前端候选列表）。
pub fn supported_targets(from: &str) -> Vec<String> {
    match normalize_format(from) {
        Some(f) => [
            Format::Md,
            Format::Txt,
            Format::Html,
            Format::Csv,
            Format::Docx,
            Format::Xlsx,
            Format::Pptx,
            Format::Pdf,
        ]
        .iter()
        .filter(|&&t| can_convert(f, t))
        .map(|&t| format_ext(t).to_string())
        .collect(),
        None => Vec::new(),
    }
}

/// 主入口：`input` 从 `from` 转 `to`。
pub fn convert(input: &[u8], from: &str, to: &str) -> Result<ConvertOutput, String> {
    let from = normalize_format(from).ok_or_else(|| format!("不支持的源格式: {from}"))?;
    let to = normalize_format(to).ok_or_else(|| format!("不支持的目标格式: {to}"))?;
    if from == to {
        return Ok(ConvertOutput {
            data: input.to_vec(),
            is_text: is_text_format(to),
        });
    }
    if to == Format::Pdf {
        return Err("PDF 导出由前端渲染完成（保证与预览一致），请走前端转换入口".to_string());
    }
    if !can_convert(from, to) {
        return Err(format!(
            "不支持的转换: {} -> {}（请参考支持矩阵）",
            format_label(from),
            format_label(to)
        ));
    }

    // docx -> html：优先用 office 的原生 HTML 渲染（表格/样式/图片比经 md 枢纽保真）
    if from == Format::Docx && to == Format::Html {
        return Ok(ConvertOutput {
            data: crate::office::docx_to_html(input)?.into_bytes(),
            is_text: true,
        });
    }

    let md = read_as_markdown(from, input)?;
    let data: Vec<u8> = match to {
        Format::Md => md.into_bytes(),
        Format::Txt => text::md_to_text(&md).into_bytes(),
        Format::Html => text::md_to_html(&md).into_bytes(),
        Format::Csv => text::md_to_csv(&md).into_bytes(),
        Format::Docx => crate::office::md_to_docx(&md)?,
        Format::Xlsx => crate::office::md_to_xlsx(&md)?,
        // 由 md 新建 pptx：original 传空，图片回填不参与
        Format::Pptx => crate::office::md_to_pptx(&md, &[])?,
        Format::Pdf => unreachable!("PDF 已在上方拦截"),
    };
    Ok(ConvertOutput {
        data,
        is_text: is_text_format(to),
    })
}

/// markdown 枢纽的读侧：把源字节读为 Markdown。
fn read_as_markdown(from: Format, input: &[u8]) -> Result<String, String> {
    let text = String::from_utf8_lossy(input);
    match from {
        Format::Md | Format::Txt => Ok(text.to_string()),
        Format::Html => Ok(text::html_to_md(&text)),
        Format::Csv => Ok(text::csv_to_md(&text)),
        Format::Docx => crate::office::docx_to_md(input),
        Format::Xlsx => crate::office::xlsx_to_md(input),
        Format::Pptx => crate::office::pptx_to_md(input),
        Format::Pdf => Err("PDF 作为源需要 PDF 解析引擎，当前未支持".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md_to_html_and_txt() {
        let html = convert("# 标题\n\n正文 **粗**".as_bytes(), "md", "html").unwrap();
        assert!(html.is_text);
        let s = String::from_utf8(html.data).unwrap();
        assert!(s.contains("<h1>标题</h1>"), "{s}");

        let txt = convert("# 标题\n\n正文 **粗**".as_bytes(), "md", "txt").unwrap();
        let t = String::from_utf8(txt.data).unwrap();
        assert!(t.contains("标题") && t.contains("粗"));
        assert!(!t.contains('#') && !t.contains('*'));
    }

    #[test]
    fn md_to_office_family() {
        for target in ["docx", "xlsx", "pptx"] {
            let out = convert("# 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |".as_bytes(), "md", target)
                .unwrap_or_else(|e| panic!("md->{target} 失败: {e}"));
            assert!(out.data.starts_with(b"PK"), "md->{target} 不是合法 zip");
        }
    }

    #[test]
    fn office_roundtrip_through_md() {
        let docx = crate::office::md_to_docx("# 标题\n\n正文").unwrap();
        let back = convert(&docx, "docx", "md").unwrap();
        assert!(String::from_utf8(back.data).unwrap().contains("标题"));

        let xlsx = convert(&docx, "docx", "xlsx").unwrap();
        assert!(xlsx.data.starts_with(b"PK"));

        let pptx = convert(&docx, "docx", "pptx").unwrap();
        assert!(pptx.data.starts_with(b"PK"));
    }

    #[test]
    fn html_and_csv_sources() {
        let md = convert("<h1>标题</h1><p>正文</p>".as_bytes(), "html", "md").unwrap();
        assert!(String::from_utf8(md.data).unwrap().contains("# 标题"));

        let xlsx = convert("a,b\n1,2\n".as_bytes(), "csv", "xlsx").unwrap();
        assert!(xlsx.data.starts_with(b"PK"));
    }

    #[test]
    fn rejected_pairs_and_pdf() {
        // pdf 目标交由前端，后端必须明确拒绝而不是静默产出坏文件
        assert!(convert(b"x", "md", "pdf").is_err());
        // 未纳入矩阵的配对
        assert!(convert(b"x", "csv", "pptx").is_err());
        assert!(convert(b"x", "pptx", "csv").is_err());
        assert!(convert(b"x", "pdf", "md").is_err());
        // 自身不参与
        assert!(supported_targets("md").iter().all(|t| t != "md"));
    }

    #[test]
    fn supported_targets_shape() {
        assert_eq!(
            supported_targets("md"),
            vec!["txt", "html", "docx", "xlsx", "pptx", "pdf"]
        );
        assert_eq!(supported_targets("html"), vec!["md", "txt"]);
        assert!(supported_targets("exe").is_empty());
    }
}
