// Univer 转换器冒烟测试：pptx -> Univer slides、docx -> Univer 文档，并校验写回闭环。
// 覆盖两个易回归点：rels 文件名下标（num vs 0 基）、Univer 数据字段的驼峰拼写。
use std::io::{Cursor, Write};

fn fixture_pptx() -> Vec<u8> {
    const SLIDE: &str = r#"<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10603875" cy="1224250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="3600" b="1"><a:solidFill><a:srgbClr val="20386F"/></a:solidFill></a:rPr><a:t>Hello Univer</a:t></a:r></a:p></p:txBody></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="3" name="pic"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="1828800" y="3240000"/><a:ext cx="1828800" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"#;
    const RELS: &str = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/img1.png"/>
</Relationships>"#;
    const PRES: &str = r#"<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>"#;
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0xff,
        0x3d, 0x6c, 0xde, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut z = zip::ZipWriter::new(Cursor::new(&mut buf));
        let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        z.start_file("ppt/slides/slide1.xml", opts).unwrap();
        z.write_all(SLIDE.as_bytes()).unwrap();
        z.start_file("ppt/slides/_rels/slide1.xml.rels", opts).unwrap();
        z.write_all(RELS.as_bytes()).unwrap();
        z.start_file("ppt/presentation.xml", opts).unwrap();
        z.write_all(PRES.as_bytes()).unwrap();
        z.start_file("ppt/media/img1.png", opts).unwrap();
        z.write_all(PNG).unwrap();
        z.finish().unwrap();
    }
    buf
}

#[test]
fn pptx_to_univer_and_back() {
    let pptx = fixture_pptx();
    let v: serde_json::Value =
        serde_json::from_str(&mdview_lib::office::pptx_to_univer(&pptx).unwrap()).unwrap();

    assert_eq!(v["pageSize"]["width"], 960);
    assert_eq!(v["body"]["pageOrder"].as_array().unwrap().len(), 1);
    assert_eq!(v["skippedImages"], 0);

    let page = &v["body"]["pages"]["p1"];
    assert_eq!(page["pageType"], 0);
    assert_eq!(page["pageElements"].as_object().unwrap().len(), 2);

    // 文本 element：富文本走 rich，行内字号/颜色在 textRuns 里
    let text = &page["pageElements"]["e1_0"];
    assert_eq!(text["type"], 2);
    assert_eq!(
        text["richText"]["rich"]["body"]["dataStream"].as_str().unwrap(),
        "Hello Univer\r"
    );
    let run = &text["richText"]["rich"]["body"]["paragraphs"][0]["textRuns"][0];
    assert_eq!(run["st"], 0);
    assert_eq!(run["ed"], 12);
    assert_eq!(run["ts"]["fs"], 36);
    assert_eq!(run["ts"]["cl"], "#20386F");

    // 图片 element：原样内联为 data URI
    let pic = &page["pageElements"]["e1_1"];
    assert_eq!(pic["type"], 1);
    assert!(pic["image"]["imageProperties"]["contentUrl"]
        .as_str()
        .unwrap()
        .starts_with("data:image/png;base64,"));

    // manifest 必须带齐写回所需的 slideIndex / shapeIndex
    let manifest = v["manifest"].as_array().unwrap();
    assert_eq!(manifest.len(), 2);
    assert_eq!(manifest[0]["kind"], "text");
    assert_eq!(manifest[0]["shapeIndex"], 0);
    assert_eq!(manifest[1]["kind"], "pic");
    assert_eq!(manifest[1]["rid"], "rId2");

    // 写回闭环：按 manifest 落点改写后必须能被重新读回
    let out = mdview_lib::office::update_pptx_text(&pptx, 0, 0, "Hello MdView").unwrap();
    let v2: serde_json::Value =
        serde_json::from_str(&mdview_lib::office::pptx_to_univer(&out).unwrap()).unwrap();
    assert_eq!(
        v2["body"]["pages"]["p1"]["pageElements"]["e1_0"]["richText"]["rich"]["body"]["dataStream"]
            .as_str()
            .unwrap(),
        "Hello MdView\r"
    );
    assert_eq!(
        v2["body"]["pages"]["p1"]["pageElements"]["e1_1"]["type"],
        1,
        "写回不应影响图片元素"
    );
}

#[test]
fn docx_to_univer_uses_camel_case() {
    let md = "# 标题\n\n正文 **粗**\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    let docx = mdview_lib::office::md_to_docx(md).unwrap();
    let d: serde_json::Value =
        serde_json::from_str(&mdview_lib::office::docx_to_univer(&docx).unwrap()).unwrap();

    assert!(d["documentStyle"]["pageSize"].is_object(), "documentStyle 缺失");
    assert!(d["body"]["dataStream"].as_str().unwrap().contains("标题"));
    let paras = d["body"]["paragraphs"].as_array().unwrap();
    assert!(
        paras[0]["startIndex"].as_u64().is_some(),
        "startIndex 缺失（驼峰拼错会导致正文空白）"
    );
    assert!(paras[0]["paragraphId"].is_string(), "paragraphId 缺失");
    assert!(
        paras[0]["textRuns"].as_array().unwrap().len() > 0,
        "textRuns 缺失"
    );
}
