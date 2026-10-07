import { createRuntimeHost } from "./server.js";
const { app, init } = createRuntimeHost();
const port = Number(process.env.PORT ?? 4310);
init().then(() => app.listen({ port, host: "0.0.0.0" })).then(() => console.log(`CkaDinTi runtime host listening on ${port}`)).catch(error => { console.error(error); process.exitCode = 1; });
