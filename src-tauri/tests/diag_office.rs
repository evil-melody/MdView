/// 真实 docx 文件回归：docx_to_md 不得 panic / 卡死（openTab 永久 spinner 曾疑似此处，实为前端响应性问题，此测试锁定 Rust 侧行为）
use std::fs;

#[test]
fn docx_to_md_real_file_no_panic() {
    let path = "/Users/tatsuma/Documents/GIT/agent-service/tests/data/readhead-doc/红头文件模板.docx";
    let data = match fs::read(path) {
        Ok(d) => d,
        Err(_) => return, // 测试文件不存在时跳过
    };
    let result = std::panic::catch_unwind(|| mdview_lib::office::docx_to_md(&data));
    match result {
        Ok(Ok(md)) => assert!(!md.is_empty(), "docx_to_md 输出为空"),
        Ok(Err(e)) => panic!("docx_to_md 返回错误: {e}"),
        Err(_) => panic!("docx_to_md panic"),
    }
}
