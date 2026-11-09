// Quem pode ver o quê: master vê tudo; profissional vê só as próprias pastas.
import { q } from './db.js';

/** Pastas visíveis ao usuário. */
export function foldersFor(user) {
  return user.isMaster ? q.folders.all() : q.foldersOf.all(user.id).map(f => ({ ...f, owner_name: user.name }));
}
export function canAccessFolder(user, folder) {
  return !!folder && (user.isMaster || folder.owner_id === user.id);
}
export function canAccessEvent(user, ev) {
  if (!user || !ev) return false;
  if (user.isMaster) return true;
  if (!ev.folder_id) return false;
  return canAccessFolder(user, q.folderById.get(ev.folder_id));
}
/** Ids de pasta permitidos (null = todas, para o master). */
export function folderIdsFor(user) {
  return user.isMaster ? null : q.foldersOf.all(user.id).map(f => f.id);
}
/**
 * Eventos visíveis, opcionalmente filtrados por pasta.
 * folder: undefined/'' = todas; 'none' = sem pasta (só master); número = pasta.
 */
export function eventsFor(user, rows, folder) {
  const allowed = folderIdsFor(user);
  return rows.filter(e => {
    if (allowed && !allowed.includes(e.folder_id)) return false;
    if (folder === 'none') return !e.folder_id;
    if (folder) return e.folder_id === Number(folder);
    return true;
  });
}
