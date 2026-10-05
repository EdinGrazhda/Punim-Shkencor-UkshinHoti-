import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, makeTeacherStore } from "./teacher-auth.js";

const email = z.string().trim().email().max(254).transform(value => value.toLowerCase()).parse(process.argv[2]);
const name = z.string().trim().min(2).max(80).parse(process.argv[3] ?? "CkaDinTi Admin");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to bootstrap a persistent admin");
const store = makeTeacherStore();
try {
  await store.init();
  if (await store.findByEmail(email)) throw new Error("An account with that email already exists. Choose another email.");
  const password = randomBytes(24).toString("base64url");
  await store.create(name, email, await hashPassword(password), "admin");
  console.log(`Admin created for ${email}. Save this one-time password now:\n${password}`);
} finally {
  await store.close();
}
