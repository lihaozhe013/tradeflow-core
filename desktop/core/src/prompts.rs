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
    let id = profile.id.clone();
    let executable = quote(&profile.helper_path.to_string_lossy());
    let invoke = if cfg!(windows) { "& " } else { "" };
    let serve = format!("{invoke}{executable} serve --profile {id}");
    let doctor = format!("{invoke}{executable} doctor --profile {id} --json");
    let describe = format!("{invoke}{executable} describe --profile {id} --json");
    let tools = if profile.tools.is_empty() {
        "—".to_owned()
    } else {
        profile.tools.join(", ")
    };
    let catalog = profile
        .catalog_version
        .clone()
        .unwrap_or_else(|| "unknown".into());
    let guide = profile
        .guide_version
        .clone()
        .unwrap_or_else(|| "unknown".into());
    let pairs = [
        ("{{serverName}}", profile.server_name()),
        ("{{tools}}", tools),
        ("{{client}}", profile.client.clone()),
        ("{{server}}", profile.base_url.clone()),
        ("{{account}}", profile.owner_username.clone()),
        ("{{profile}}", id),
        ("{{helperPath}}", profile.helper_path.display().to_string()),
        ("{{mode}}", profile.mode.clone()),
        ("{{expiresAt}}", profile.expires_at.clone()),
        ("{{catalogVersion}}", catalog),
        ("{{guideVersion}}", guide),
        ("{{serveCommand}}", serve),
        ("{{doctorCommand}}", doctor),
        ("{{describeCommand}}", describe),
    ];
    json!({
        "business": render(templates["business"].as_str().unwrap_or_default(), &pairs),
        "connect": render(templates["connect"].as_str().unwrap_or_default(), &pairs),
        "update": render(templates["update"].as_str().unwrap_or_default(), &pairs),
        "repair": render(templates["repair"].as_str().unwrap_or_default(), &pairs),
        "metadata": {
            "server": profile.base_url,
            "client": profile.client,
            "profile": profile.id,
            "serverName": profile.server_name(),
            "catalogVersion": profile.catalog_version,
            "guideVersion": profile.guide_version,
        }
    })
}
