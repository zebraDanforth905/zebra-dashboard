'use client';

import { PrinterIcon } from "@heroicons/react/24/outline";

export default function PrintButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <button
      onClick={handlePrint}
      className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors print:hidden flex items-center gap-2"
      title="Print slips"
    >
      <PrinterIcon className="w-5 h-5" />
      Print
    </button>
  );
}
