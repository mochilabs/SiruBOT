"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const CHOSEONG = [
	"ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];
const JUNGSEONG = [
	"ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
];
const JONGSEONG = [
	"", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

function decomposeHangul(char: string) {
	const code = char.charCodeAt(0) - 0xac00;
	if (code < 0 || code > 11171) return [char];

	const jong = code % 28;
	const jung = ((code - jong) / 28) % 21;
	const cho = ((code - jong) / 28 - jung) / 21;

	const states = [CHOSEONG[cho]];
	states.push(String.fromCharCode(0xac00 + (cho * 21 + jung) * 28));
	if (jong > 0) {
		states.push(String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong));
	}

	return states;
}

export function TypingText({ 
	texts, 
	speed = 150, 
	delay = 2000,
	className = "" 
}: { 
	texts: string[]; 
	speed?: number; 
	delay?: number;
	className?: string;
}) {
	const [displayText, setDisplayText] = useState("");
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isDeleting, setIsDeleting] = useState(false);
	const [charIndex, setCharIndex] = useState(0);
	const [stateIndex, setStateIndex] = useState(0);

	useEffect(() => {
		let timeout: NodeJS.Timeout;
		const currentFullText = texts[currentIndex % texts.length];

		const tick = () => {
			if (!isDeleting) {
				if (charIndex < currentFullText.length) {
					const char = currentFullText[charIndex];
					const states = decomposeHangul(char);

					if (stateIndex < states.length) {
						// Apply the current state of the char being composed
						const baseText = currentFullText.slice(0, charIndex);
						setDisplayText(baseText + states[stateIndex]);
						setStateIndex(prev => prev + 1);
						timeout = setTimeout(tick, speed / 2);
					} else {
						// Finished composing this char, move to next
						setCharIndex(prev => prev + 1);
						setStateIndex(0);
						timeout = setTimeout(tick, speed);
					}
				} else {
					// Finished the whole string
					timeout = setTimeout(() => setIsDeleting(true), delay);
				}
			} else {
				// Deleting
				if (displayText.length > 0) {
					setDisplayText(prev => prev.slice(0, -1));
					timeout = setTimeout(tick, speed / 3);
				} else {
					setIsDeleting(false);
					setCharIndex(0);
					setStateIndex(0);
					setCurrentIndex(prev => prev + 1);
					timeout = setTimeout(tick, 500);
				}
			}
		};

		timeout = setTimeout(tick, speed);
		return () => clearTimeout(timeout);
	}, [displayText, isDeleting, currentIndex, charIndex, stateIndex, texts, speed, delay]);

	return (
		<span className={className}>
			<span className={className + " inline-block"}>{displayText}</span>
			<motion.span
				animate={{ opacity: [1, 0] }}
				transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
				className="inline-block w-[2px] h-[0.8em] bg-primary ml-1 align-middle"
			/>
		</span>
	);
}
