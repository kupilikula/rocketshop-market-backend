// Add this helper function, perhaps in a shared utils file
export const roundToTwoDecimals = (num) => {
    if (num === null || num === undefined || isNaN(Number(num))) {
        // console.warn(`Rounding non-numeric value: ${num}`); // Optional warning
        return 0;
    }
    // Multiply, round to integer, then divide to avoid floating point issues
    return Math.round(Number(num) * 100) / 100;
};