export type CursorData = {
  createdAt: Date;
  id: number;
};

export type CursorDataString = {
  createdAt: Date;
  id: string;
};

export const buildCursor = (createdAt: Date, id: number) =>
  `${createdAt.toISOString()}|${id}`;

export const buildCursorString = (createdAt: Date, id: string) =>
  `${createdAt.toISOString()}|${id}`;

export const parseCursor = (cursor: string | null | undefined): CursorData | null => {
  if (!cursor) {
    return null;
  }

  const [datePart, idPart] = cursor.split("|");
  if (!datePart || !idPart) {
    return null;
  }

  const createdAt = new Date(datePart);
  const id = Number(idPart);

  if (Number.isNaN(createdAt.getTime()) || !Number.isFinite(id)) {
    return null;
  }

  return { createdAt, id };
};

export const parseCursorString = (
  cursor: string | null | undefined
): CursorDataString | null => {
  if (!cursor) {
    return null;
  }

  const [datePart, idPart] = cursor.split("|");
  if (!datePart || !idPart) {
    return null;
  }

  const createdAt = new Date(datePart);

  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return { createdAt, id: idPart };
};
