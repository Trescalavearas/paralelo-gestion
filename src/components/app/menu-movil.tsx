"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { BarraLateral } from "@/components/app/barra-lateral";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MenuMovil({ selector }: { selector?: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="bg-white" aria-label="Abrir menú">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[290px] bg-white p-4 pt-12">
        <SheetTitle className="sr-only">Menú</SheetTitle>
        <BarraLateral selector={selector} alNavegar={() => setAbierto(false)} />
      </SheetContent>
    </Sheet>
  );
}
