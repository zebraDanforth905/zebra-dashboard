import { scrapeNow } from "../lib/actions";

export default function Page() {
  async function run() {
    "use server";
    await scrapeNow();
  }
  return (
    <form action={run}>
      <button className="btn">Scrape now</button>
    </form>
  );
}