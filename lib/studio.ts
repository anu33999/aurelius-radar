/** Where the studio is based, used only in outreach wording. Set STUDIO_LOCATION in .env (e.g. "Jaipur, India"); blank omits it. */
export function studioLocation(): string {
  return (process.env.STUDIO_LOCATION ?? "").trim();
}

export const inLocation = () => {
  const l = studioLocation();
  return l ? ` in ${l}` : "";
};
