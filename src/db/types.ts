import type { db } from "./client";

export type DbClient = typeof db;
type TransactionCallback = Parameters<DbClient["transaction"]>[0];
export type DbTransaction = Parameters<TransactionCallback>[0];
export type DbOrTx = DbClient | DbTransaction;
