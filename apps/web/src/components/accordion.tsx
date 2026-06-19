/**
 * Base-UI Accordion wrappers around @radix-ui/react-accordion.
 * These are intentionally unstyled — consumers apply their own classes.
 */
import * as AccordionPrimitive from '@radix-ui/react-accordion'

export const Accordion = AccordionPrimitive.Root
export const AccordionItem = AccordionPrimitive.Item

export const AccordionContent = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>) => (
  <AccordionPrimitive.Content
    className={['landing-faq-accordion-content', className].filter(Boolean).join(' ')}
    {...props}
  >
    {children}
  </AccordionPrimitive.Content>
)
