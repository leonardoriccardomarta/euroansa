import type { DocumentType } from "@/db/schema";

/** Heuristica leggera da nome file (import storico Drive, senza OCR). */
export function guessDocumentTypeFromFileName(fileName: string): DocumentType {
  const n = fileName.toLowerCase();
  if (/carta.?ident|ci[_ -]|identity|documento.?ident/i.test(n))
    return "CARTA_IDENTITA";
  if (/tessera.?sanit|codice.?fisc|health.?card|ts[_ -]/i.test(n))
    return "TESSERA_SANITARIA";
  if (/permesso.?sogg/i.test(n)) return "PERMESSO_SOGGIORNO";
  if (/passaport/i.test(n)) return "PASSAPORTO";
  if (/residenza/i.test(n)) return "CERTIFICATO_RESIDENZA";
  if (/stato.?famig/i.test(n)) return "STATO_FAMIGLIA";
  if (/busta.?paga|cedolino(?!.?pens)/i.test(n)) {
    if (/[_\s-]3\b|marzo|03/.test(n)) return "BUSTA_PAGA_3";
    if (/[_\s-]2\b|febbr|02/.test(n)) return "BUSTA_PAGA_2";
    return "BUSTA_PAGA_1";
  }
  if (/\bcud\b|730/i.test(n)) return "CUD_730";
  if (/contratto.?lavor/i.test(n)) return "CONTRATTO_LAVORO";
  if (/unico/i.test(n)) return "MODELLO_UNICO";
  if (/\bf24\b/i.test(n)) return "F24";
  if (/visura|camera.?comm/i.test(n)) return "VISURA_CAMERALE";
  if (/p.?iva|partita/i.test(n)) return "CERTIFICATO_PIVA";
  if (/pensione|obis/i.test(n)) return "CEDOLINO_PENSIONE";
  if (/estratto.?conto|\becc\b/i.test(n)) return "ESTRATTO_CONTO";
  if (/preliminare/i.test(n)) return "PRELIMINARE_COMPRAVENDITA";
  if (/atto.?proven|compravendita|atto.?immob/i.test(n)) return "ATTO_IMMOBILE";
  if (/catast/i.test(n)) return "SCHEDE_CATASTALI";
  if (/privacy|contratto.?mediaz|ddm|mandato|consenso/i.test(n))
    return "SCONOSCIUTO";
  return "SCONOSCIUTO";
}
