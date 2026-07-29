import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const signAccess = (user) =>
  jwt.sign({ sub: user.id, role: user.role, username: user.username }, config.jwtSecret, {
    expiresIn: config.accessTtl,
  });

export const signRefresh = (user) =>
  jwt.sign({ sub: user.id, typ: "refresh" }, config.jwtRefreshSecret, { expiresIn: config.refreshTtl });

export const verifyAccess = (token) => jwt.verify(token, config.jwtSecret);
export const verifyRefresh = (token) => jwt.verify(token, config.jwtRefreshSecret);
