import { createRuntimeHost } from "./server.js";
const { app } = createRuntimeHost();
const port = Number(process.env.PORT ?? 4310);
app.listen({ port, host: "0.0.0.0" }).then(() => console.log(`CkaDinTi runtime host listening on ${port}`));
