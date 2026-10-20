import { Type } from '@sinclair/typebox';

export const GUID = Type.String({ pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' });

export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

export const PlayerIdParams = Type.Object({ id: GUID });
