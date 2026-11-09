import React, { useState, useEffect } from "react";

export default function ScrollToTopButton({ race = false }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsVisible(window.scrollY > 400);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (!isVisible) return null;

    return (
        <button className={`scroll-top-btn${race ? " scroll-top-btn--race" : ""}`} onClick={scrollToTop} aria-label="맨 위로 이동">
            ↑ 맨 위로
        </button>
    );
}
