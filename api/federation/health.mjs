import {apiEnabled,capabilities} from "../../packages/ank-federation/src/service.mjs";
export default function handler(_request,response){response.setHeader("cache-control","no-store");response.status(200).json({...capabilities(),api_enabled:apiEnabled(),sovereign_products:["ANUNNAKI","GC","MN"]})}
