import {validate} from './model.js';
export function startupDocument(session,draft,editedAt) {
  let local;try{local=validate(typeof draft==='string'?JSON.parse(draft):draft);}catch{}
  if(session.document){const saved=validate(session.document);return local?.id===saved.id&&Number(editedAt)>Date.parse(session.updatedAt)?local:saved;}
  return local&&!session.deletedIds?.includes(local.id)?local:null;
}
