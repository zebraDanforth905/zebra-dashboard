'use client';

import { useState } from 'react';
import { scrapeCampEnrolments } from '@/app/lib/actions';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function ScrapeCampsButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleScrape = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const result = await scrapeCampEnrolments();
      if (result.ok) {
        alert(`Successfully scraped camp enrolments!\nInserted: ${result.inserted}\nUpdated: ${result.updated}`);
        window.location.reload();
      } else {
        alert(`Error scraping camps: ${result.ok}`);
      }
    } catch (error) {
      alert(`Failed to scrape camps: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleScrape}
      disabled={isLoading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Scraping...' : 'Scrape Camps'}
    </button>
  );
}
