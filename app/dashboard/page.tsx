import { scrapeNowLocal } from "../lib/actions";

export default function Page() {
  
  return (
    <form action={scrapeNowLocal}>
      <button className="btn">Scrape now</button>
    </form>
  );
}