import { z } from "zod";

export const StatusSchema = z.enum(["ok", "standby", "atencao", "off", "manutencao"]);
export type Status = z.infer<typeof StatusSchema>;

export const RowSchema = z.object({
  id: z.string().min(1),
  frame: z.string(),
  model: z.string().default(""),
  source: z.string(),
  description: z.string(),
  note: z.string(),
  status: StatusSchema,
});
export type Row = z.infer<typeof RowSchema>;

export const ColumnsSchema = z.object({
  frame: z.string(),
  model: z.string(),
  source: z.string(),
  description: z.string(),
  note: z.string(),
  status: z.string(),
});
export type Columns = z.infer<typeof ColumnsSchema>;

export const DEFAULT_COLUMNS: Columns = {
  frame: "Frame",
  model: "Modelo",
  source: "Fonte",
  description: "Descrição",
  note: "Nota",
  status: "Status",
};

export const ClockConfigSchema = z.object({
  visible: z.boolean(),
  scale: z.number().min(1).max(5),
  x: z.number(),
  y: z.number(),
});
export type ClockConfig = z.infer<typeof ClockConfigSchema>;

export const ImageConfigSchema = z.object({
  src: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  visible: z.boolean(),
});
export type ImageConfig = z.infer<typeof ImageConfigSchema>;

export const StateSchema = z.object({
  rows: z.array(RowSchema).max(20),
  columns: ColumnsSchema.optional(),
  image: ImageConfigSchema.optional(),
  memo: z.string().optional(),
  clock: ClockConfigSchema.optional(),
});
export type State = z.infer<typeof StateSchema>;

// Client → server messages
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

export const SetColumnsMessageSchema = z.object({
  type: z.literal("setColumns"),
  columns: ColumnsSchema,
});

export const SetClockMessageSchema = z.object({
  type: z.literal("setClock"),
  clock: ClockConfigSchema,
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  SetStateMessageSchema,
  UpsertRowMessageSchema,
  RemoveRowMessageSchema,
  ReorderMessageSchema,
  SetColumnsMessageSchema,
  SetClockMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server → client messages
export const TelemetrySchema = z.object({
  location: z.object({ city: z.string(), region: z.string() }).nullable(),
  weather: z.object({
    tempC: z.number(),
    condition: z.string(),
    raining: z.boolean(),
    rainChancePct: z.number(),
  }).nullable(),
  internet: z.object({
    online: z.boolean(),
    onlineSinceMs: z.number().nullable(),
    lastDownAtMs: z.number().nullable(),
  }),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const FileMetaSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  sizeBytes: z.number(),
  uploadedAtMs: z.number(),
  contentType: z.string(),
});
export type FileMeta = z.infer<typeof FileMetaSchema>;

export type ServerMessage =
  | { type: "state"; state: State }
  | { type: "telemetry"; telemetry: Telemetry }
  | { type: "filesChanged" };
