"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";

type CampoClaveProps = {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
};

/** Campo de contraseña con botón para mostrarla u ocultarla. */
export function CampoClave({ id, name, autoComplete, placeholder = "••••••••" }: CampoClaveProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="h-11 pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl outline-none focus-visible:ring-[3px]"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
