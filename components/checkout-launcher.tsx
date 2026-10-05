"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactDialog } from "@/components/contact-dialog";
import type { Service } from "@/lib/services";

export function CheckoutLauncher({ service }: { service: Service }) {
  return (
    <ContactDialog serviceTitle={service.title}>
      <Button size="xl" className="w-full sm:w-auto">
        <MessageCircle className="h-5 w-5" />
        Связаться по услуге
      </Button>
    </ContactDialog>
  );
}
