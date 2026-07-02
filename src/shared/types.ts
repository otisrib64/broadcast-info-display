import { z } from "zod";

export const StatusSchema = z.enum(["ok", "standby", "atencao", "off", "manutencao"]);
export type Status = z.infer<typeof StatusSchema>;

// Upper bounds keep a hostile/buggy client from parking megabytes of text in
// RAM and state.json on a 1 GB Pi. Generous for real use (cell text ~40 chars).
const CELL_MAX  = 500;
const ID_MAX    = 64;
const LABEL_MAX = 100;
const MEMO_MAX  = 2000;
// 3 MB binary ≈ 4 MB base64 (client-side cap), under the 5 MB WS frame limit.
const IMAGE_SRC_MAX = 4_500_000;

export const RowSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  frame: z.string().max(CELL_MAX),
  model: z.string().max(CELL_MAX).default(""),
  source: z.string().max(CELL_MAX),
  description: z.string().max(CELL_MAX),
  note: z.string().max(CELL_MAX),
  status: StatusSchema,
});
export type Row = z.infer<typeof RowSchema>;

export const ColumnsSchema = z.object({
  frame: z.string().max(LABEL_MAX),
  model: z.string().max(LABEL_MAX),
  source: z.string().max(LABEL_MAX),
  description: z.string().max(LABEL_MAX),
  note: z.string().max(LABEL_MAX),
  status: z.string().max(LABEL_MAX),
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

export const StopwatchSchema = z.object({
  running: z.boolean(),
  startedAtMs: z.number().nullable(),
  accumulatedMs: z.number(),
});
export type Stopwatch = z.infer<typeof StopwatchSchema>;

export const ClockConfigSchema = z.object({
  visible: z.boolean(),
  scale: z.number().min(1).max(5),
  x: z.number(),
  y: z.number(),
  mode: z.enum(["clock", "stopwatch"]).default("clock"),
  stopwatch: StopwatchSchema.optional(),
});
export type ClockConfig = z.infer<typeof ClockConfigSchema>;

export const ImageConfigSchema = z.object({
  src: z.string().max(IMAGE_SRC_MAX),
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
  memo: z.string().max(MEMO_MAX).optional(),
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
  id: z.string().min(1).max(ID_MAX),
});

export const ReorderMessageSchema = z.object({
  type: z.literal("reorder"),
  ids: z.array(z.string().min(1).max(ID_MAX)).max(100),
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
  location: z.object({ city: z.string(), region: z.string(), lat: z.number(), lon: z.number() }).nullable(),
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
