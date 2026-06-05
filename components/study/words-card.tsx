import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function WordsCard() {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Words</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Browse reviewed words and meanings.
        </p>
      </CardContent>
      <CardFooter>
        <Button asChild type="button" variant="outline">
          <Link href="/words">
            <ArrowRight data-icon="inline-start" />
            Browse words
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
