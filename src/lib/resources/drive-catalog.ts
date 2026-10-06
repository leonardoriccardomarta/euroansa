import type { ResourceCategory } from "@/db/schema";

/**
 * File Drive ufficiali da portare in Risorse (Sync da Drive).
 * ID fissi dalla root / documentazione / template Euroansa.
 */
export type ResourceDriveSeed = {
  driveFileId: string;
  title: string;
  category: ResourceCategory;
};

export const RESOURCE_DRIVE_SEEDS: ResourceDriveSeed[] = [
  // Documentazione
  {
    driveFileId: "1Gyn0gWVf87_OE0bNwyUR1ZwbFPnDpa4o",
    title: "Modulistica (archivio zip)",
    category: "MODULISTICA",
  },
  {
    driveFileId: "1HDU7p6GP9r71AxWDuTPa0kmQwKZcdIKN",
    title: "Offerta banche (archivio zip)",
    category: "PORTALI",
  },
  {
    driveFileId: "1vbfxNE_esIw_F4XFNNHeLzOrotMa0JXl",
    title: "Utilità ufficio (archivio zip)",
    category: "ALTRO",
  },
  {
    driveFileId: "1PJmr8p-7LzF9Yhxw4cdjWOQJtxvFDDo-",
    title: "Manuale operativo policy banche 2026",
    category: "POLICY",
  },
  {
    driveFileId: "1NsrOw59PQdnNyieoVQR9P2bVkC2Qifhy",
    title: "Lista documenti",
    category: "TEMPLATE",
  },
  {
    driveFileId: "1nDCzYLWVMxW96VYObWdLSxvIgA-Ukrnu",
    title: "Roadmap mutuo",
    category: "TEMPLATE",
  },
  // Template root
  {
    driveFileId: "1v6uiNS6Pd2uwBpNXEtUa3oIxTGyB-Ogn",
    title: "Modello relazione 3",
    category: "TEMPLATE",
  },
  {
    driveFileId: "1xOvNqxj7HbIAVSenVPPE8UQEmhZRg30m",
    title: "Modello relazione 1",
    category: "TEMPLATE",
  },
  {
    driveFileId: "1AF2sUg4NvLdsPxDgUZwnYBHwGqgj6q-M",
    title: "Modello relazione 2",
    category: "TEMPLATE",
  },
  {
    driveFileId: "1AMDgm14tn-kQ2_vc_MCK3QHIzpXRX0ik",
    title: "Modello preventivo mutuo",
    category: "TEMPLATE",
  },
  {
    driveFileId: "1atcfiiHldsh9ms2x6T25b1-kJzxNovfq",
    title: "Modello preatto",
    category: "TEMPLATE",
  },
  // Back office
  {
    driveFileId: "1oq7hfze4Qo72BpjkrxhOrnmotkDh5Lrg",
    title: "Copertina pratica",
    category: "TEMPLATE",
  },
  {
    driveFileId: "1TEMqp0UbyXdXH_GRnL_irIfS0JDWgU8O",
    title: "Modello domanda garanzia CONSAP",
    category: "MODULISTICA",
  },
  {
    driveFileId: "1phEiY7kIfPKrgMR3_W_lMTn3_DDCk345",
    title: "Scheda banche (Excel)",
    category: "POLICY",
  },
];

/** Cartelle Drive pratiche broker (import 2026). */
export const BROKER_DRIVE_ROOTS = {
  FILIPPO: "1dZ_6u87UZznozfXttG7mLZg7H-HRcfFg",
  MARCO: "1dwKvAptJyET7TOhbY17TTdl4qDoYKt4C",
} as const;

export const BROKER_ECONOMY_SHEETS = {
  FILIPPO_2026: "1DRpeLPYQB77xG_6CpGn_caGFqiGvgLce",
  MARCO_2026: "1DSRvUqsfDJ6yOz2LYTcpR8iFXJGcTPIR",
} as const;
