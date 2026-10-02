import { createRuntimeHost } from "./server.js";
const { app, teacherStore, studentStore } = createRuntimeHost();
const port = Number(process.env.PORT ?? 4310);
Promise.all([teacherStore.init(), studentStore.init()]).then(() => app.listen({ port, host: "0.0.0.0" })).then(() => console.log(`CkaDinTi runtime host listening on ${port}`)).catch(error => { console.error(error); process.exitCode = 1; });
