import { z } from "zod";

export const StatusSchema = z.enum(["live", "standby", "off"]);
export type Status = z.infer<typeof StatusSchema>;

export const RowSchema = z.object({
  id: z.string().min(1),
  frame: z.string(),
  source: z.string(),
  description: z.string(),
  note: z.string(),
  status: StatusSchema,
});
export type Row = z.infer<typeof RowSchema>;

export const StateSchema = z.object({
  rows: z.array(RowSchema),
});
export type State = z.infer<typeof StateSchema>;

// Messages client → server
export const SetStateMessageSchema = z.object({
  type: z.literal("setState"),
  state: StateSchema,
});

export const UpsertRowMessageSchema = z.object({
  type: z.literal("upsertRow"),
  row: RowSchema,
});

export const RemoveRowMessageSchema = z.object({
  type: z.literal("removeRow"),
  id: z.string().min(1),
});

export const ReorderMessageSchema = z.object({
  type: z.literal("reorder"),
  ids: z.array(z.string().min(1)),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  SetStateMessageSchema,
  UpsertRowMessageSchema,
  RemoveRowMessageSchema,
  ReorderMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Message server → clients
export type ServerMessage = { type: "state"; state: State };
