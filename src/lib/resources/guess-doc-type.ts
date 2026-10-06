import type { DocumentType } from "@/db/schema";

/**
 * Heuristica da nome file stile Drive Filip (ESLAM_bp 03, ESLAM_cud26, ecc.).
 * Usata in import storico senza OCR.
 */
export function guessDocumentTypeFromFileName(fileName: string): DocumentType {
  const n = fileName
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^.*\//, "")
    .replace(/\.pdf$/i, "");

  // Ordine: più specifico prima (file combinati CI+TS+PDS → CI)
  if (/carta.?ident|(^|[_\s-])ci([_\s-]|$)|fronte.?retro|identity/.test(n))
    return "CARTA_IDENTITA";
  if (/permesso.?sogg/.test(n) || (/(^|[_\s-])pds([_\s-]|$)/.test(n) && !/\bci\b/.test(n)))
    return "PERMESSO_SOGGIORNO";
  if (/tessera.?sanit|(^|[_\s-])ts([_\s-]|$)|codice.?fisc/.test(n))
    return "TESSERA_SANITARIA";
  if (/passaport/.test(n)) return "PASSAPORTO";
  if (/residenza/.test(n)) return "CERTIFICATO_RESIDENZA";
  if (/stato.?famig/.test(n)) return "STATO_FAMIGLIA";

  // Buste paga: "bp 03", "bp02", "busta paga"
  if (/(^|[_\s-])bp([_\s-]|$)|busta.?paga|cedolino(?!.?pens)/.test(n)) {
    if (/([_\s-]|^)(3|03|marzo)([_\s-]|$)/.test(n)) return "BUSTA_PAGA_3";
    if (/([_\s-]|^)(2|02|febbr)([_\s-]|$)/.test(n)) return "BUSTA_PAGA_2";
    return "BUSTA_PAGA_1";
  }
  if (/cumulativo/.test(n)) return "BUSTA_PAGA_1";

  if (/cud|modello.?730|(^|[_\s-])730([_\s-]|$)/.test(n)) return "CUD_730";
  if (/contratto.?di.?lavor|contratto.?lavor|unilav/.test(n))
    return "CONTRATTO_LAVORO";
  if (/estratto.?contrib|ecc.?inps|inps/.test(n) && /ecc|estratto|contrib/.test(n))
    return "ESTRATTO_CONTRIBUTIVO_INPS";
  if (/isee/.test(n)) return "ISEE";

  if (/unico.?2|unico_2/.test(n)) return "MODELLO_UNICO_2";
  if (/unico.?1|unico_1/.test(n)) return "MODELLO_UNICO_1";
  if (/unico/.test(n)) return "MODELLO_UNICO";
  if (/\bf24\b/.test(n)) return "F24";
  if (/visura|camera.?comm/.test(n)) return "VISURA_CAMERALE";
  if (/p.?iva|partita.?iva|cert.?piva/.test(n)) return "CERTIFICATO_PIVA";
  if (/pensione|obis/.test(n)) return "CEDOLINO_PENSIONE";

  if (/lista.?moviment/.test(n)) return "LISTA_MOVIMENTI_3_MESI";
  if (/(^|[_\s-])ecc([_\s.-]|$)|estratto.?conto/.test(n))
    return "ESTRATTO_CONTO";

  if (/preliminare|proposta/.test(n)) return "PRELIMINARE_COMPRAVENDITA";
  if (/planimetr|catast|scheda.?catast/.test(n)) return "SCHEDE_CATASTALI";
  if (/(^|[_\s-])atto([_\s.-]|$)|atto.?proven|compravendita|atto.?immob/.test(n))
    return "ATTO_IMMOBILE";
  if (/affitto/.test(n)) return "CONTRATTO_AFFITTO";
  if (/quietanza|rata.?mutuo/.test(n)) return "QUIETANZA_RATA_MUTUO";
  if (/polizz/.test(n) && /risparm|vita|investimento/.test(n))
    return "POLIZZE_RISPARMIO";
  if (/finanziament/.test(n)) return "CONTRATTI_FINANZIAMENTO";

  // Firmati / banca operativi: restano SCONOSCIUTO (non in checklist tipica)
  // ddm, privacy, avvenuta consegna, ape, …
  return "SCONOSCIUTO";
}
