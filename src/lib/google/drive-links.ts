/**
 * Estrae file/cartelle Google Drive da testo o HTML della mail
 * (allegati grandi inviati come link invece che attachment).
 */

const FILE_ID_PATTERNS: RegExp[] = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/gi,
  /drive\.google\.com\/open\?[^>\s"'\\]*[?&]id=([a-zA-Z0-9_-]+)/gi,
  /drive\.google\.com\/uc\?[^>\s"'\\]*[?&]id=([a-zA-Z0-9_-]+)/gi,
  /docs\.google\.com\/(?:document|spreadsheets|presentation|drawings)\/d\/([a-zA-Z0-9_-]+)/gi,
];

const FOLDER_ID_PATTERNS: RegExp[] = [
  /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/gi,
  /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/gi,
];

function collectIds(text: string, patterns: RegExp[]): string[] {
  const ids = new Set<string>();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1]) ids.add(m[1]);
    }
  }
  return [...ids];
}

export function extractDriveFileIdsFromText(text: string): string[] {
  return collectIds(text, FILE_ID_PATTERNS);
}

export function extractDriveFolderIdsFromText(text: string): string[] {
  return collectIds(text, FOLDER_ID_PATTERNS);
}

export function isAllowedDriveAttachmentName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  );
}
