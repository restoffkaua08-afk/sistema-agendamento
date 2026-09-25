import Fastify from "fastify";
const app = Fastify({ logger:true });
type CreateAppointment = {serviceId?:unknown;staffId?:unknown;startsAt?:unknown;customerName?:unknown;customerEmail?:unknown;customerPhone?:unknown};
function isCreateAppointment(input: unknown): input is CreateAppointment { if (!input || typeof input !== "object") return false; const value=input as CreateAppointment; return typeof value.serviceId === "string" && typeof value.staffId === "string" && typeof value.startsAt === "string" && typeof value.customerName === "string" && value.customerName.length >= 2 && typeof value.customerEmail === "string" && value.customerEmail.includes("@") && typeof value.customerPhone === "string" && value.customerPhone.length >= 8; }
app.get("/health",async()=>({status:"ok",service:"agenda-api"}));
app.post("/v1/public/:slug/appointments",async(request,reply)=>{if(!isCreateAppointment(request.body))return reply.code(400).send({code:"VALIDATION_ERROR",message:"Dados inválidos."});return reply.code(201).send({appointment:{readableNumber:"A-DEMO",status:"confirmed"},warning:"adapter de demonstração"});});
app.listen({port:Number(process.env.PORT??3333),host:process.env.HOST??"0.0.0.0"}).catch((error)=>{app.log.error(error);process.exit(1);});
