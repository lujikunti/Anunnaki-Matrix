export default function handler(_request,response){
  response.setHeader("cache-control","no-store");
  response.status(200).json({
    service:"ank-federation",
    contract:"ANK_FEDERATION_V1",
    version:"2026-09-25.1",
    apiEnabled:process.env.ANK_FEDERATION_API_ENABLED==="true",
    auditEngineConfigured:Boolean(process.env.ANK_AUDIT_ENGINE_URL),
    twinEngineConfigured:Boolean(process.env.ANK_TWIN_ENGINE_URL),
    teachingDefault:"QUARANTINE",
    sovereignProducts:["ANUNNAKI","GC","MN"]
  });
}
