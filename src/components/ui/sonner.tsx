import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({
  closeButton = true,
  duration = 4000,
  expand = true,
  gap = 12,
  ...props
}: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      closeButton={closeButton}
      duration={duration}
      expand={expand}
      gap={gap}
      toastOptions={{
        style: {
          "--toast-duration": `${duration}ms`,
        } as React.CSSProperties,
        classNames: {
          toast:
            "group toast overflow-hidden group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
