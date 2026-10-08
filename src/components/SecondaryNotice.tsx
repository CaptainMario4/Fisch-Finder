import type { SecondarySource } from '../lib/secondary-source';
export default function SecondaryNotice({ source }: { source?: SecondarySource }) {
  if (!source) return null;
  return <p className="fish-data-notice">Provisional Fisch Fandom information — unverified. Fischipedia takes priority when it lists this entry. Unimported fields show “Not listed.” Source revision: {source.revisionAt.slice(0, 10)}{source.checkedAt ? ` · checked ${source.checkedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}. Adapted from Fisch Wiki contributors under <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">{source.license}</a>. Confirm requirements on the full source page.</p>;
}
