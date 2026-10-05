"""Hand checked quiz questions.

A 3B model cannot be trusted to write a correct answer key, so quizzes come from this bank.
Each row: (level, question, correct answer, three wrong answers, explanation, topic).
Options are shuffled when a quiz is served.
"""
import random

from models.schemas import QuizQuestion

B, I, A = "beginner", "intermediate", "advanced"
LEVELS = (B, I, A)

BANK = {
    1: [
        (B, "In Python, what is a variable?", "A named box that stores a value",
         ["A command that draws a picture", "A mistake in the program", "A way to repeat code"],
         "A variable is a name that holds a value so you can use it later.", "what is a variable"),
        (B, "Which line stores the number 5 in a variable called age?", "age equals 5",
         ["5 equals age", "age colon 5", "store age as 5"],
         "The name goes on the left and the value goes on the right of the equals sign.", "what is a variable"),
        (B, "Which function shows text on the screen in Python?", "print",
         ["show", "echo", "speak"],
         "The print function displays values on the screen.", "print function"),
        (B, "Which rule is true for variable names in Python?", "They cannot start with a number",
         ["They can contain spaces", "They must start with a capital letter", "They can only be one letter long"],
         "A name can use letters, digits and underscores, but it cannot begin with a digit.", "naming rules"),
        (I, "Two pieces of text, 2 and 3, are joined with a plus sign. What is the result?", "The text 23",
         ["The number 5", "The text 2 plus 3", "An error"],
         "Plus joins pieces of text together, so 2 and 3 become 23.", "string vs number"),
        (I, "A variable x holds 4. Then the line x equals x plus 1 runs. What does x hold now?", "5",
         ["4", "1", "Nothing, it causes an error"],
         "Python works out the right side first, 4 plus 1, then stores 5 back in x.", "what is a variable"),
        (A, "You store 1 in a variable called total, and 2 in a variable called Total with a capital T. How many variables exist?", "Two",
         ["One", "Zero, it causes an error", "Three"],
         "Python is case sensitive, so total and Total are different names.", "naming rules"),
        (A, "What does the end option of print control?", "What is printed after the text, a new line by default",
         ["How many times the text repeats", "The color of the text", "Where the program stops"],
         "By default print ends with a new line, and the end option changes that.", "print function"),
    ],
    2: [
        (B, "Which of these is an integer?", "42",
         ["3.14", "hello", "True"],
         "An integer is a whole number with no decimal point.", "integers"),
        (B, "Which data type is the value 3.14?", "float",
         ["integer", "string", "boolean"],
         "A float is a number with a decimal point.", "floats"),
        (B, "Which values can a boolean hold?", "True or False",
         ["Any whole number", "Any text", "Only zero"],
         "A boolean has exactly two possible values, True and False.", "booleans"),
        (B, "What does the type function tell you?", "The data type of a value",
         ["The size of a file", "The speed of the program", "The name of a variable"],
         "type tells you what kind of value you have, such as int or str.", "type() function"),
        (I, "What does the type function return for the number 7?", "The class int, meaning integer",
         ["The class float", "The class str", "The class bool"],
         "A whole number like 7 has the type int.", "type() function"),
        (I, "In Python 3, what is 7 divided by 2 using the normal division operator?", "3.5",
         ["3", "4", "2"],
         "Normal division gives a float with the exact answer.", "floats"),
        (A, "What is the data type of the result when 4 is divided by 2 with normal division?", "float, because division always gives a float",
         ["integer, because the answer is whole", "string", "boolean"],
         "Normal division always returns a float, so the answer is 2.0.", "floats"),
        (A, "What does the int function give for 3.9?", "3",
         ["4", "3.9", "An error"],
         "int cuts off the decimal part. It does not round.", "integers"),
    ],
    3: [
        (B, "What does an if statement do?", "Runs code only when a condition is true",
         ["Repeats code forever", "Stores a value", "Prints text on the screen"],
         "An if statement lets the program make a choice.", "if"),
        (B, "When does the else part run?", "When the if condition is false",
         ["When the if condition is true", "Always", "Never"],
         "else is the backup path for when the if condition is not true.", "else"),
        (B, "Which operator checks if two values are equal?", "Two equals signs",
         ["One equals sign", "An arrow", "A colon"],
         "Two equals signs compare values. One equals sign stores a value.", "comparison operators"),
        (B, "What does the expression 10 greater than 3 give?", "True",
         ["False", "10", "3"],
         "A comparison gives True or False. Ten is greater than three, so it is True.", "comparison operators"),
        (I, "What is elif used for?", "Checking another condition when the first one was false",
         ["Ending the program", "Repeating a block of code", "Defining a function"],
         "elif means else if. It adds another question to ask.", "elif"),
        (I, "x holds 5. The code says: if x is greater than 3, print big, else print small. What is printed?", "big",
         ["small", "Both big and small", "Nothing"],
         "Five is greater than three, so the if part runs.", "if"),
        (A, "In an if, elif, else chain, which blocks run?", "Only the first block whose condition is true",
         ["Every block whose condition is true", "The last block only", "All blocks in order"],
         "Python checks from the top and stops at the first true condition.", "elif"),
        (A, "What does the expression 5 not equal to 5 give?", "False",
         ["True", "5", "An error"],
         "Five is equal to five, so saying they are not equal is False.", "comparison operators"),
    ],
    4: [
        (B, "What is a loop for?", "Repeating code many times",
         ["Storing a value", "Making a decision", "Naming a function"],
         "A loop repeats work so you do not write the same code again and again.", "for loop"),
        (B, "What numbers does range of 3 produce?", "0, 1 and 2",
         ["1, 2 and 3", "0, 1, 2 and 3", "3 only"],
         "range starts at zero and stops before the number you give.", "range()"),
        (B, "Which loop keeps running as long as a condition stays true?", "A while loop",
         ["A for loop with range", "An if statement", "A function call"],
         "A while loop checks its condition before every round.", "while loop"),
        (B, "What does the break statement do?", "Stops the loop immediately",
         ["Skips to the next round", "Restarts the program", "Prints the loop count"],
         "break jumps out of the loop right away.", "break and continue"),
        (I, "What does the continue statement do?", "Skips the rest of this round and starts the next one",
         ["Stops the loop", "Ends the program", "Repeats the same round"],
         "continue jumps to the next round of the loop.", "break and continue"),
        (I, "What numbers does range from 2 to 5 produce?", "2, 3 and 4",
         ["2, 3, 4 and 5", "3, 4 and 5", "2 and 5"],
         "The start is included and the stop number is not.", "range()"),
        (A, "A while loop has a condition that never becomes false. What happens?", "It runs forever, which is called an infinite loop",
         ["It runs once", "Python fixes it", "It stops after ten rounds"],
         "Nothing stops the loop, so you must make the condition change or use break.", "while loop"),
        (A, "What numbers does range with start 10, stop 0 and step minus 2 produce?", "10, 8, 6, 4 and 2",
         ["10, 8, 6, 4, 2 and 0", "8, 6, 4, 2 and 0", "0, 2, 4, 6, 8 and 10"],
         "It counts down by two and stops before reaching zero.", "range()"),
    ],
    5: [
        (B, "Which keyword creates a function in Python?", "def",
         ["func", "function", "make"],
         "def is short for define.", "def"),
        (B, "What is a parameter?", "A name for a value a function receives",
         ["The answer a function gives back", "The name of the file", "A kind of loop"],
         "Parameters are the inputs a function expects.", "parameters"),
        (B, "What does return do?", "Sends a value back from the function",
         ["Starts the function", "Deletes the function", "Repeats the function"],
         "return hands a result back to the code that called the function.", "return values"),
        (B, "How do you run a function you have defined?", "Call it by writing its name with brackets",
         ["Write def again", "Nothing, it runs by itself", "Close the program"],
         "A function only runs when you call it.", "calling functions"),
        (I, "A function has no return statement. What does it give back?", "None",
         ["Zero", "An empty string", "An error"],
         "Python returns the special value None when there is no return.", "return values"),
        (I, "A function greet has a parameter name with the default value friend. What happens when greet is called with no arguments?", "It uses friend",
         ["It causes an error", "It uses an empty name", "It asks the user for a name"],
         "A default value is used when no argument is given.", "default parameters"),
        (A, "What is the difference between print and return inside a function?", "print shows a value, return hands it back to the caller",
         ["They are exactly the same", "return shows a value on screen, print hands it back", "print stops the function, return does not"],
         "print is for people to see. return is for other code to use.", "return values"),
        (A, "Where can you use a variable that was created inside a function?", "Only inside that function",
         ["Everywhere in the program", "Only outside the function", "In every other function"],
         "Variables made inside a function are local to it.", "calling functions"),
    ],
}

# how many questions to take from (beginner, intermediate, advanced) for each learner level
MIX = {B: (3, 2, 0), I: (1, 2, 2), A: (0, 2, 2)}


def pick_questions(module_id: int, difficulty: str, k: int = 5) -> list[QuizQuestion]:
    rows = BANK.get(module_id, [])
    pools = {lvl: [r for r in rows if r[0] == lvl] for lvl in LEVELS}
    for pool in pools.values():
        random.shuffle(pool)
    mix = MIX.get(difficulty, MIX[B])
    chosen = []
    for lvl, count in zip(LEVELS, mix):
        chosen += pools[lvl][:count]
    rest = [r for r in rows if r not in chosen]
    random.shuffle(rest)
    chosen += rest[: max(0, k - len(chosen))]
    chosen.sort(key=lambda r: LEVELS.index(r[0]))

    out = []
    for _, question, answer, wrong, explanation, topic in chosen[:k]:
        options = [answer] + list(wrong)
        random.shuffle(options)
        out.append(
            QuizQuestion(
                question=question,
                options=options,
                correct_index=options.index(answer),
                explanation=explanation,
                topic=topic,
            )
        )
    return out