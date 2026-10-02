use anyhow::{Context, Result, bail};
use std::{os::windows::ffi::OsStrExt, path::Path, ptr, sync::OnceLock};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree},
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            SDDL_REVISION_1,
        },
        DACL_SECURITY_INFORMATION, GetTokenInformation, PROTECTED_DACL_SECURITY_INFORMATION,
        SetFileSecurityW, TOKEN_QUERY, TOKEN_USER, TokenUser,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

fn current_user_sid() -> Result<String> {
    static SID: OnceLock<String> = OnceLock::new();
    if let Some(sid) = SID.get() {
        return Ok(sid.clone());
    }
    // TOKEN_USER contains a pointer, so its backing buffer must be naturally aligned.
    let sid = unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            bail!("ACL_IDENTITY_FAILED");
        }
        let result = (|| {
            let mut required = 0;
            GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut required);
            if required == 0 {
                bail!("ACL_IDENTITY_FAILED");
            }
            let mut buffer = vec![0usize; (required as usize).div_ceil(size_of::<usize>())];
            if GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                required,
                &mut required,
            ) == 0
            {
                bail!("ACL_IDENTITY_FAILED");
            }
            let user = &*buffer.as_ptr().cast::<TOKEN_USER>();
            let mut text = ptr::null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut text) == 0 {
                bail!("ACL_IDENTITY_FAILED");
            }
            let mut length = 0;
            while *text.add(length) != 0 {
                length += 1;
            }
            let value = String::from_utf16(std::slice::from_raw_parts(text, length));
            LocalFree(text.cast());
            value.context("ACL_IDENTITY_FAILED")
        })();
        CloseHandle(token);
        result?
    };
    let _ = SID.set(sid.clone());
    Ok(sid)
}

pub fn restrict(path: &Path, directory: bool) -> Result<()> {
    let sid = current_user_sid()?;
    let flags = if directory { "OICI" } else { "" };
    let descriptor: Vec<u16> = format!("D:P(A;{flags};FA;;;{sid})")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let mut security = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            descriptor.as_ptr(),
            SDDL_REVISION_1,
            &mut security,
            ptr::null_mut(),
        ) == 0
        {
            bail!("ACL_UPDATE_FAILED");
        }
        let result = SetFileSecurityW(
            path.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            security,
        );
        LocalFree(security);
        if result == 0 {
            bail!("ACL_UPDATE_FAILED");
        }
    }
    Ok(())
}
