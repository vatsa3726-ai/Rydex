import type { FastifyRequest } from "fastify";
import type { Database } from "./database.js";
import type { PhotoStorage } from "./photo-storage.js";
export class VeyraError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export type VeyraUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  age_verified_until: Date | string | null;
  age_method: string | null;
  access_blocked: boolean;
};
export type VeyraContext = {
  db: Database;
  production: boolean;
  user(req: FastifyRequest): VeyraUser;
  verified(user: VeyraUser): boolean;
  premium(userId: string): Promise<boolean>;
  model(id: string, admin?: boolean): Promise<any>;
  audit(
    actor: string,
    action: string,
    target: string,
    db?: Database,
    reason?: string,
  ): Promise<void>;
  storage?: PhotoStorage;
};
