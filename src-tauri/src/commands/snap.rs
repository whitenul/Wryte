// Windows 11 原生 Snap Layouts 通过模拟 Win+Z 按键触发；
// 其他平台返回 false，由前端 fallback 到自定义 Snap 面板。

#[cfg(target_os = "windows")]
pub fn trigger_snap_layout() -> Result<bool, String> {
    use winapi::um::winuser::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    };

    // VK_LWIN = 0x5B, VK_Z = 0x5A
    const VK_LWIN: u16 = 0x5B;
    const VK_Z: u16 = 0x5A;

    let make_input = |w_vk: u16, flags: u32| -> INPUT {
        let mut input: INPUT = unsafe { std::mem::zeroed() };
        input.type_ = INPUT_KEYBOARD;
        unsafe {
            *input.u.ki_mut() = KEYBDINPUT {
                wVk: w_vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            };
        }
        input
    };

    let mut inputs: [INPUT; 4] = [
        make_input(VK_LWIN, KEYEVENTF_EXTENDEDKEY),
        make_input(VK_Z, 0),
        make_input(VK_Z, KEYEVENTF_KEYUP),
        make_input(VK_LWIN, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP),
    ];

    unsafe {
        let sent = SendInput(
            4,
            inputs.as_mut_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
        if sent == 0 {
            return Err("SendInput 调用失败".to_string());
        }
    }
    Ok(true)
}

#[cfg(not(target_os = "windows"))]
pub fn trigger_snap_layout() -> Result<bool, String> {
    Ok(false)
}
