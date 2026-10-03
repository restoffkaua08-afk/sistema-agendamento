import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig={appId:"com.marca.agenda",appName:"Marca Agenda",webDir:"www",server:process.env.MOBILE_WEB_URL?{url:process.env.MOBILE_WEB_URL,cleartext:false}:undefined};
export default config;
