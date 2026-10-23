/**
 * Locks of an editing session: who is changing which part of the document. Ported from the
 * Document Server (server DocService/sources/DocsCoServer.js getLock, _checkLockWord,
 * _checkLockExcel, compareExcelBlock, _checkLockPresentation, comparePresentationBlock), so the
 * engine sees the answers it expects.
 */

export type Lock = { time: number; user: string; block: unknown };
export type Locks = Record<string, Lock>;

/** DocsCoServer EditorTypes: what `auth` names as `editorType`. */
export const EDITOR_TYPE = { document: 0, spreadsheet: 1, presentation: 2 } as const;

/** DocsCoServer c_oAscLockTypeElem: what a spreadsheet lock covers. */
const SHEET_LOCK = { Range: 1, Object: 2, Sheet: 3 } as const;

/** DocsCoServer c_oAscLockTypeElemSubType. */
const SHEET_SUBTYPE = {
  DeleteColumns: 1,
  InsertColumns: 2,
  DeleteRows: 3,
  InsertRows: 4,
  ChangeProperties: 5,
} as const;

/** DocsCoServer c_oAscLockTypeElemPresentation. */
const SLIDE_LOCK = { Object: 1, Slide: 2, Presentation: 3 } as const;

type Range = { c1: number; c2: number; r1: number; r2: number };

/** A spreadsheet block: `{ sheetId, type, subType, rangeOrObjectId, guid }`. */
type SheetBlock = {
  sheetId?: unknown;
  type?: number;
  subType?: number | null;
  rangeOrObjectId?: unknown;
};

/** A presentation block: `{ type, val }` or `{ type, slideId, objId }`. */
type SlideBlock = { type?: number; val?: unknown; slideId?: unknown; objId?: unknown };

/** A lock's key: the block's guid (spreadsheets, presentations), or the block itself (text). */
export const lockKey = (block: unknown): string =>
  typeof block === "object" && block && "guid" in block
    ? String((block as { guid: unknown }).guid)
    : String(block);

const intersects = (a: Range, b: Range): boolean =>
  !(b.c1 > a.c2 || b.c2 < a.c1 || b.r1 > a.r2 || b.r2 < a.r1);

const isRange = (value: unknown): value is Range =>
  typeof value === "object" && value !== null && ["c1", "c2", "r1", "r2"].every((key) => key in value);

/** DocsCoServer compareExcelBlock: whether a new block collides with someone else's. */
const sheetBlocksCollide = (next: SheetBlock, old: SheetBlock): boolean => {
  const nextSubType = next.subType ?? null;
  const oldSubType = old.subType ?? null;
  // Both insert or remove rows or columns.
  if (nextSubType !== null && oldSubType !== null) return true;
  // A lock from changing properties counts only against a whole sheet.
  if (
    (oldSubType === SHEET_SUBTYPE.ChangeProperties && next.type !== SHEET_LOCK.Sheet) ||
    (nextSubType === SHEET_SUBTYPE.ChangeProperties && old.type !== SHEET_LOCK.Sheet)
  ) {
    return false;
  }
  switch (next.type) {
    case SHEET_LOCK.Range:
      if (old.type === SHEET_LOCK.Sheet) return true;
      if (old.type !== SHEET_LOCK.Range) return false;
      if (oldSubType === SHEET_SUBTYPE.InsertRows || oldSubType === SHEET_SUBTYPE.InsertColumns) return false;
      return isRange(next.rangeOrObjectId) && isRange(old.rangeOrObjectId)
        ? intersects(next.rangeOrObjectId, old.rangeOrObjectId)
        : false;
    case SHEET_LOCK.Sheet:
      return true;
    case SHEET_LOCK.Object:
      return (
        old.type === SHEET_LOCK.Sheet ||
        (old.type === SHEET_LOCK.Object && old.rangeOrObjectId === next.rangeOrObjectId)
      );
    default:
      return false;
  }
};

type Check = (all: Locks, added: Locks, blocks: unknown[], user: string) => boolean;

/** DocsCoServer _checkLockExcel: whether all the blocks asked for may be taken. */
const checkSheetLocks: Check = (all, added, blocks, user) => {
  if (blocks.length === 0) return false;
  for (const raw of blocks) {
    const block = raw as SheetBlock;
    for (const [key, lock] of Object.entries(all)) {
      if (added[key]) continue;
      const held = (lock.block ?? null) as SheetBlock | null;
      // The same user asking again for the same object: nothing new.
      if (
        lock.user === user &&
        held &&
        block.sheetId === held.sheetId &&
        block.type === SHEET_LOCK.Object &&
        held.type === SHEET_LOCK.Object &&
        held.rangeOrObjectId === block.rangeOrObjectId
      ) {
        return false;
      }
      if (block.type === SHEET_LOCK.Sheet && held?.type === SHEET_LOCK.Sheet) {
        // Someone else holding a sheet blocks every sheet lock (so nobody deletes all sheets).
        if (lock.user !== user) return false;
        if (block.sheetId === held.sheetId) return false;
        continue;
      }
      if (lock.user === user || !held || block.sheetId !== held.sheetId) continue;
      if (sheetBlocksCollide(block, held)) return false;
    }
  }
  return true;
};

/** DocsCoServer comparePresentationBlock. */
const slideBlocksCollide = (next: SlideBlock, old: SlideBlock): boolean => {
  switch (next.type) {
    case SLIDE_LOCK.Presentation:
      return old.type === SLIDE_LOCK.Presentation && next.val === old.val;
    case SLIDE_LOCK.Slide:
      if (old.type === SLIDE_LOCK.Slide) return next.val === old.val;
      return old.type === SLIDE_LOCK.Object && next.val === old.slideId;
    case SLIDE_LOCK.Object:
      if (old.type === SLIDE_LOCK.Slide) return next.slideId === old.val;
      return old.type === SLIDE_LOCK.Object && next.objId === old.objId;
    default:
      return false;
  }
};

/** DocsCoServer _checkLockPresentation. */
const checkSlideLocks: Check = (all, added, blocks, user) => {
  if (blocks.length === 0) return false;
  for (const raw of blocks) {
    for (const [key, lock] of Object.entries(all)) {
      if (added[key] || lock.user === user || !lock.block) continue;
      if (slideBlocksCollide(raw as SlideBlock, lock.block as SlideBlock)) return false;
    }
  }
  return true;
};

/** DocsCoServer _checkLockWord: text documents grant every lock. */
const checkTextLocks: Check = () => true;

const CHECKS: Record<number, Check> = {
  [EDITOR_TYPE.document]: checkTextLocks,
  [EDITOR_TYPE.spreadsheet]: checkSheetLocks,
  [EDITOR_TYPE.presentation]: checkSlideLocks,
};

/**
 * DocsCoServer getLock: blocks nobody holds yet are added (Redis "NX", per key). When some were
 * held already, the editor's check decides; if it refuses, the new ones are taken back. Either way
 * everyone gets all locks, and the client sees from the owner whether it got its own.
 */
export const acquireLocks = (
  locks: Locks,
  blocks: unknown[],
  user: string,
  now: number,
  editorType: number,
): Locks => {
  const asked: Locks = Object.fromEntries(
    blocks.map((block) => [lockKey(block), { time: now, user, block }]),
  );
  const added = Object.fromEntries(Object.entries(asked).filter(([key]) => !(key in locks)));
  const all = { ...locks, ...added };
  const conflicts = Object.keys(asked).length !== Object.keys(added).length;
  const check = CHECKS[editorType] ?? checkTextLocks;
  return conflicts && !check(all, added, blocks, user) ? locks : all;
};

/** How `auth` hands over the locks: a map for text documents, a list otherwise (DocsCoServer sendAuthInfo). */
export const locksForAuth = (locks: Locks, editorType: number): Locks | Lock[] =>
  editorType === EDITOR_TYPE.document ? locks : Object.values(locks);
