
import { getAuthConfig } from "../utils/auth";
import { appConfigPath } from "../utils/paths";

console.log("App Config Path:", appConfigPath);
const config = getAuthConfig();
console.log("Auth Config:", JSON.stringify(config, null, 2));

if (config.enabled === false) {
    console.log("Auth is DISABLED (Correct)");
} else {
    console.log("Auth is ENABLED (Incorrect if appConfig.json has enabled: false)");
}
