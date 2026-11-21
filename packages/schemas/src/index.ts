import { z } from 'zod';

export * from './database.types';
export * from './enums';
export * from './domain';

export const DummySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type DummyType = z.infer<typeof DummySchema>;

export function validateDummy(data: unknown): DummyType {
  return DummySchema.parse(data);
}
