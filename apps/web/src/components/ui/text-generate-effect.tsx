"use client";
import { useEffect } from "react";
import { motion, stagger, useAnimate } from "motion/react";
import { cn } from "../../lib/utils";

export const TextGenerateEffect = ({
  words,
  className,
  filter = true,
  duration = 0.5,
  highlights = [],
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
  highlights?: string[];
}) => {
  const [scope, animate] = useAnimate();
  let wordsArray = words.split(" ");
  useEffect(() => {
    animate(
      "span.anim-word",
      {
        opacity: 1,
        filter: filter ? "blur(0px)" : "none",
      },
      {
        duration: duration ? duration : 1,
        delay: stagger(0.04), // slightly faster for this longer text
      }
    );
  }, [scope.current]);

  const renderWords = () => {
    return (
      <motion.div ref={scope}>
        {wordsArray.map((word, idx) => {
          const cleanWord = word.replace(/[^a-zA-Z0-9-]/g, '');
          const isHighlighted = highlights.includes(cleanWord);
          return (
            <span key={word + idx}>
              <motion.span
                className={cn("opacity-0 inline-block anim-word", isHighlighted ? "text-gray-900 font-medium" : "")}
                style={{
                  filter: filter ? "blur(10px)" : "none",
                }}
              >
                {word}
              </motion.span>
              {" "}
            </span>
          );
        })}
      </motion.div>
    );
  };

  return (
    <div className={cn(className)}>
      {renderWords()}
    </div>
  );
};
