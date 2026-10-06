import type { DocumentType } from "@/db/schema";

/**
 * Euristica forte da nome file stile Drive Filip (ESLAM_bp 03, ESLAM_cud26…).
 */
export function guessDocumentTypeFromFileName(fileName: string): DocumentType {
  const n = fileName
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^.*\//, "")
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Firmati / non checklist → subito fuori
  if (
    /\b(ddm|privacy|avvenuta.?consegna|mandato|consenso|contratto.?mediaz|ape|certificazione.?energetica)\b/.test(
      n,
    )
  ) {
    return "SCONOSCIUTO";
  }

  // Anagrafica (file combinati CI+TS+PDS → CI)
  if (
    /carta.?ident|(^|[_\s-])ci([_\s-]|$)|fronte.?retro|identity|documento.?ident/.test(
      n,
    )
  ) {
    return "CARTA_IDENTITA";
  }
  if (
    /permesso.?sogg/.test(n) ||
    (/(^|[_\s-])pds([_\s-]|$)/.test(n) && !/\bci\b/.test(n))
  ) {
    return "PERMESSO_SOGGIORNO";
  }
  if (
    /tessera.?sanit|(^|[_\s-])ts([_\s-]|$)|codice.?fisc|health.?card/.test(n)
  ) {
    return "TESSERA_SANITARIA";
  }
  if (/passaport/.test(n)) return "PASSAPORTO";
  // ANPR / contestuale / "cumulativo" anagrafico — NON busta paga
  if (
    /stato.?famig|contestuale|anagrafe|anpr|cumulativo/.test(n) ||
    (/residenza/.test(n) && /famig|stato|certificat/.test(n))
  ) {
    return "STATO_FAMIGLIA";
  }
  if (/residenza/.test(n)) return "CERTIFICATO_RESIDENZA";
  if (/stato.?liber/.test(n)) return "CERTIFICATO_STATO_LIBERO";
  if (/matrimon/.test(n)) return "ATTO_MATRIMONIO";
  if (/vedov/.test(n)) return "CERTIFICATO_VEDOVANZA";
  if (/separaz/.test(n)) return "OMOLOGA_SEPARAZIONE";
  if (/divorz/.test(n)) return "SENTENZA_DIVORZIO";

  // Reddito
  if (/(^|[_\s-])bp([_\s-]|$)|busta.?paga|cedolino(?!.?pens)/.test(n)) {
    if (/([_\s-]|^)(3|03|marzo)([_\s.-]|$)/.test(n)) return "BUSTA_PAGA_3";
    if (/([_\s-]|^)(2|02|febbr)([_\s.-]|$)/.test(n)) return "BUSTA_PAGA_2";
    if (/([_\s-]|^)(1|01|genn)([_\s.-]|$)/.test(n)) return "BUSTA_PAGA_1";
    return "BUSTA_PAGA_1";
  }

  if (/\b730\b|modello.?730/.test(n)) return "MODELLO_730";
  if (/\bcud\b|modello.?cu\b|(^|[_\s-])cu([_\s-]|$)|cud\d*/.test(n))
    return "MODELLO_CUD";
  if (/contratto.?di.?lavor|contratto.?lavor|unilav|assunzione/.test(n))
    return "CONTRATTO_LAVORO";
  if (
    /estratto.?contrib|contrib.?inps|ecc.?inps|(^|[_\s-])inps([_\s.-]|$)/.test(n)
  ) {
    return "ESTRATTO_CONTRIBUTIVO_INPS";
  }
  if (/isee/.test(n)) return "ISEE";

  if (/unico.?2|unico_2|unico.?202[0-9].*2/.test(n)) return "MODELLO_UNICO_2";
  if (/unico.?1|unico_1/.test(n)) return "MODELLO_UNICO_1";
  if (/unico|redditi/.test(n)) return "MODELLO_UNICO";
  if (/\bf24\b/.test(n)) return "F24";
  if (/visura|camera.?comm/.test(n)) return "VISURA_CAMERALE";
  if (/p.?iva|partita.?iva|attribuzione.?piva/.test(n)) return "CERTIFICATO_PIVA";
  if (/bilancino/.test(n)) return "BILANCINO";
  if (/fatture/.test(n)) return "FATTURE_EMESSE";
  if (/pensione|obis/.test(n)) return "CEDOLINO_PENSIONE";

  if (/lista.?moviment|movimenti/.test(n)) return "LISTA_MOVIMENTI_3_MESI";
  if (/(^|[_\s-])ecc([_\s.-]|$)|estratto.?conto|\becc\b/.test(n))
    return "ESTRATTO_CONTO";

  // Immobile
  if (/preliminare|proposta.?acquist|proposta/.test(n))
    return "PRELIMINARE_COMPRAVENDITA";
  if (/planimetr|catast|scheda.?catast|visura.?catast/.test(n))
    return "SCHEDE_CATASTALI";
  if (
    /(^|[_\s-])atto([_\s.-]|$)|atto.?proven|compravendita|atto.?immob|provenienza/.test(
      n,
    )
  ) {
    return "ATTO_IMMOBILE";
  }
  if (/affitto/.test(n)) return "CONTRATTO_AFFITTO";
  if (/quietanza|rata.?mutuo/.test(n)) return "QUIETANZA_RATA_MUTUO";
  if (/polizz/.test(n) && /risparm|vita|investimento/.test(n))
    return "POLIZZE_RISPARMIO";
  if (/finanziament|cessione.?quinto|cqs/.test(n))
    return "CONTRATTI_FINANZIAMENTO";

  return "SCONOSCIUTO";
}
