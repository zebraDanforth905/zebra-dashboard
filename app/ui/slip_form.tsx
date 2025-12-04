'use client';

import React, { useState, useEffect } from "react";
import { SlipInfo } from "../lib/definitions";
import Image from "next/image";
import { updateSlipInfo, deleteSlipInfo } from "../lib/actions";
import { PlusIcon, XMarkIcon, CheckIcon, TrashIcon } from "@heroicons/react/24/outline";

function makePassword(fullName: string): string {
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  // lowercase, keep only letters/numbers just in case
  let pwd = first.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (pwd.length >= 8)return pwd;

  pwd = pwd+"123";
  const seq = "4567890";      // start at 1, then 2, 3, 4...
  let i = 0;
  while (pwd.length < 8) {
    pwd += seq[i % seq.length];
    i += 1;
  }
  return pwd;
}

export default function SlipForm (props: { slip_info?: SlipInfo }) {
  const labelClass = "inline-block w-[200px] font-bold text-[20pt] text-black align-top leading-snug tracking-tight flex-shrink-0 font-[Arial]";
  const valueClass = "text-[20pt] text-black font-[Arial] leading-snug tracking-tight flex-1 min-w-0";

  const smallSlipClass = "w-full min-w-[7in] h-[3in] pl-[1.5cm] pr-[1cm] bg-white font-[Arial] text-black print:break-inside-avoid my-[0.5in]"
  const bigSlipClass = "w-full min-w-[7in] h-[5in] pl-[1.5cm] pr-[1cm] bg-white font-[Arial] text-black print:break-inside-avoid pt-[0.5in]"

  const slip_info = props.slip_info;

  // Initialize other fields from existing data or empty array
  const initialOtherFields = slip_info?.other_fields 
    ? Object.entries(slip_info.other_fields).map(([key, value]) => ({ key, value }))
    : [];
  
  const [otherFields, setOtherFields] = useState<Array<{ key: string; value: string }>>(initialOtherFields);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Track changes to form fields
  const [formData, setFormData] = useState({
    student_name: slip_info?.student_name || '',
    lms_username: slip_info?.lms_username || '',
    lms_password: (slip_info?.lms_password && slip_info.lms_password !== "None") 
      ? slip_info.lms_password 
      : makePassword(slip_info?.student_name || ""),
    course_name: slip_info?.course_name || ''
  });

  // Check if form has changes
  useEffect(() => {
    const studentNameChanged = formData.student_name !== (slip_info?.student_name || '');
    const usernameChanged = formData.lms_username !== (slip_info?.lms_username || '');
    const passwordChanged = formData.lms_password !== ((slip_info?.lms_password && slip_info.lms_password !== "None") ? slip_info.lms_password : makePassword(slip_info?.student_name || ""));
    const courseChanged = formData.course_name !== (slip_info?.course_name || '');
    
    const otherFieldsChanged = JSON.stringify(otherFields) !== JSON.stringify(initialOtherFields);
    
    setHasChanges(studentNameChanged || usernameChanged || passwordChanged || courseChanged || otherFieldsChanged);
  }, [formData, otherFields, slip_info, initialOtherFields]);

  const addField = () => {
    setOtherFields([...otherFields, { key: '', value: '' }]);
  };

  const removeField = (index: number) => {
    setOtherFields(otherFields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...otherFields];
    updated[index][field] = newValue;
    setOtherFields(updated);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Format other fields as "key: value\nkey2: value2"
    const otherFieldsString = otherFields
      .filter(f => f.key.trim() && f.value.trim())
      .map(f => `${f.key.trim()}: ${f.value.trim()}`)
      .join('\n');
    
    // Add hidden input for other_fields
    const form = e.currentTarget;
    const existingInput = form.querySelector('input[name="other_fields"]');
    if (existingInput) {
      (existingInput as HTMLInputElement).value = otherFieldsString;
    } else {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'other_fields';
      input.value = otherFieldsString;
      form.appendChild(input);
    }
  };

  return (
    <form action={updateSlipInfo} onSubmit={handleSubmit} className={otherFields.length > 0 ? bigSlipClass: smallSlipClass}>
      <input type="hidden" name="id" value={slip_info?.id} />
      <input type="hidden" name="user_id" value={slip_info?.user_id} />
    
      <div className="flex items-center justify-between">
        <div className="text-[24pt] font-bold text-[#00B0F0] tracking-wide font-[Arial]">Zebra LMS Login</div>
        <Image src={'/zebra-logo.png'} alt="Zebra Robotics Logo" height={70} width={275} />
      </div>
      <div className="space-y-[-5px] mt-2">
        <div className="flex flex-row">
          <span className={labelClass}>Student:</span>
          <input 
            className={valueClass + " font-bold"} 
            name="student_name" 
            value={formData.student_name}
            onChange={(e) => setFormData({...formData, student_name: e.target.value})}
            type="text" 
          />
        </div>
        <div className="flex flex-row">
          <span className={labelClass}>Email:</span>
          <input 
            className={valueClass} 
            name="lms_username" 
            value={formData.lms_username}
            onChange={(e) => setFormData({...formData, lms_username: e.target.value})}
            type="text"
          />
        </div>
        <div className="flex flex-row">
          <span className={labelClass}>Password:</span>
          <input 
            className={valueClass} 
            name="lms_password" 
            value={formData.lms_password}
            onChange={(e) => setFormData({...formData, lms_password: e.target.value})}
            type="text" 
          />
        </div>
        <div className="flex flex-row">
          <span className={labelClass}>Course:</span>
          <input 
            className={valueClass} 
            name="course_name" 
            value={formData.course_name}
            onChange={(e) => setFormData({...formData, course_name: e.target.value})}
            type="text" 
          />
        </div>        
      </div>
      
      {/* Dynamic Other Fields Section */}
      {otherFields.length > 0 && (
        <div className="mt-4 space-y-[-5px]">
          {otherFields.map((field, index) => (
            <div className="flex flex-row items-center gap-2" key={index}>
              <div className={labelClass + " border-b border-gray-400 print:border-0 flex flex-row"} >
              <input
              className="w-fit"
                value={field.key}
                onChange={(e) => updateField(index, 'key', e.target.value)}
                placeholder="Field name"
                type="text" 
              /> 
              </div>
     
              
              <input 
                className={valueClass + " flex-1 border-b border-gray-400 print:border-0"} 
                value={field.value}
                onChange={(e) => updateField(index, 'value', e.target.value)}
                placeholder="Value"
                type="text" 
              />
              <button 
                type="button" 
                onClick={() => removeField(index)}
                className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors print:hidden"
                title="Remove field"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2 items-center print:hidden">
        <button 
          type="button" 
          onClick={addField}
          className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
          title="Add custom field"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
        {hasChanges && (
          <button 
            type="submit" 
            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
            title="Save changes"
          >
            <CheckIcon className="w-5 h-5" />
          </button>
        )}
        <button 
          type="button" 
          onClick={() => {
          
              deleteSlipInfo(slip_info?.id || '');
            
          }}
          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors ml-auto"
          title="Delete slip"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
};


