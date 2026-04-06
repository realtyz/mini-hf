import { useState, useEffect, useCallback } from 'react';

interface UseTypewriterOptions {
  text: string;
  speed?: number;
  delay?: number;
  loop?: boolean;
  loopDelay?: number;
  deleteSpeed?: number;
}

export function useTypewriter({
  text,
  speed = 80,
  delay = 500,
  loop = false,
  loopDelay = 2000,
  deleteSpeed = 40,
}: UseTypewriterOptions) {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const startTyping = useCallback(() => {
    setDisplayText('');
    setIsTyping(true);
    setIsDeleting(false);
    setIsComplete(false);
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const type = () => {
      if (isDeleting) {
        if (displayText.length > 0) {
          setDisplayText(text.slice(0, displayText.length - 1));
          timeout = setTimeout(type, deleteSpeed);
        } else {
          setIsDeleting(false);
          setIsTyping(true);
          timeout = setTimeout(type, delay);
        }
      } else if (isTyping) {
        if (displayText.length < text.length) {
          setDisplayText(text.slice(0, displayText.length + 1));
          timeout = setTimeout(type, speed);
        } else {
          setIsTyping(false);
          setIsComplete(true);
          if (loop) {
            timeout = setTimeout(() => {
              setIsDeleting(true);
              timeout = setTimeout(type, deleteSpeed);
            }, loopDelay);
          }
        }
      }
    };

    // Initial delay before starting
    if (!isTyping && !isDeleting && displayText === '' && !isComplete) {
      timeout = setTimeout(() => {
        setIsTyping(true);
        timeout = setTimeout(type, delay);
      }, delay);
    } else {
      timeout = setTimeout(type, isDeleting ? deleteSpeed : speed);
    }

    return () => clearTimeout(timeout);
  }, [text, speed, delay, loop, loopDelay, deleteSpeed, displayText, isTyping, isDeleting, isComplete]);

  return {
    displayText,
    isTyping,
    isDeleting,
    isComplete,
    startTyping,
  };
}
