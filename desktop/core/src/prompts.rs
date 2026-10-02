use crate::storage::Profile;
use serde_json::{Value, json};

const EN: &str = include_str!("../../../frontend/src/i18n/locales/en/en-US.json");
const ZH: &str = include_str!("../../../frontend/src/i18n/locales/zh/zh-CN.json");

fn quote(value: &str) -> String {
    if cfg!(windows) {
        format!("'{}'", value.replace('\'', "''"))
    } else {
        format!("'{}'", value.replace('\'', "'\"'\"'"))
    }
}

fn render(template: &str, pairs: &[(&str, String)]) -> String {
    pairs
        .iter()
        .fold(template.to_owned(), |text, (key, value)| {
            text.replace(key, value)
        })
}

pub fn generate(profile: &Profile) -> Value {
    generate_for(profile, "en")
}

pub fn generate_for(profile: &Profile, language: &str) -> Value {
    let resources: Value = serde_json::from_str(if language == "zh" { ZH } else { EN })
        .expect("checked-in desktop locale JSON is valid");
    let templates = &resources["desktopConnect"]["prompts"];
    let name = profile.server_name();
    let tools = profile.tools.join(", ");
    let client = profile.client.name().to_owned();
    let server = profile.base_url.clone();
    let path = profile.config_path.display().to_string();
    let id = profile.id.clone();
    let executable = quote(&profile.helper_path.to_string_lossy());
    let invoke = if cfg!(windows) { "& " } else { "" };
    let common = format!("--profile {id} --client {client}");
    let doctor = format!("{invoke}{executable} doctor {common} --json");
    let repair = format!("{invoke}{executable} repair {common} --mode auto --json");
    let bridge = format!("{invoke}{executable} repair {common} --mode bridge --json");
    let pairs = [
        ("{{serverName}}", name),
        ("{{tools}}", tools),
        ("{{client}}", client),
        ("{{server}}", server.clone()),
        ("{{profile}}", id),
        ("{{configPath}}", path),
        ("{{doctor}}", doctor),
        ("{{repair}}", repair),
        ("{{bridge}}", bridge),
    ];
    json!({
        "business": render(templates["business"].as_str().unwrap_or_default(), &pairs),
        "repair": render(templates["repair"].as_str().unwrap_or_default(), &pairs),
        "metadata": {"server": server, "client": profile.client.name(), "profile": profile.id}
    })
}
