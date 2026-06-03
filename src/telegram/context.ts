import type { Context } from "grammy";
import type { User } from "@prisma/client";
import type { Services } from "../modules/container.js";

export type MyContext = Context & {
  services: Services;
  user?: User;
  isNewUser?: boolean;
};
