export function downloadBase64File(input: { base64: string; fileName: string; mimeType: string }) {
  const bytes = Uint8Array.from(atob(input.base64), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: input.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
